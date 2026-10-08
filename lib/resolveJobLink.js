// Resolves and verifies direct Comeet job links.
//
// resolveJobLink(url, jobTitle, options)  -> string (verified job URL) | false
// resolveJobLinks(url, jobTitle, options) -> string[]
// resolveJobs(url, jobTitle, options)     -> [{ url, title }]
//
// How it works (based on how Comeet pages actually behave):
//  * The URL length decides the kind of page (see MIN_URL_SEGMENTS_FOR_JOB_PAGE):
//      - 6+ segments: a specific job link  -> verify that job
//      - fewer than 6: not a job page      -> search that page for the best matching job
//  * A Comeet page embeds its data as JavaScript assignments in the HTML:
//      - job page:     POSITION_DATA = {...}            (the job; null if it doesn't exist)
//      - company page: COMPANY_POSITIONS_DATA = [...]   (all currently open jobs)
//  * A closed / non-existent job does NOT return 404. Comeet answers 200 and
//    redirects to the company page, so the HTTP status is useless. The only
//    reliable check is: POSITION_DATA exists and its uid equals the uid in the URL.
//  * Given a company page with many jobs, the open jobs are ranked by how well
//    they match the search, then each candidate is re-opened and verified
//    (job exists + does not require more experience than a junior role).
//  * Never throws. Any failure after all retries returns false / [].
//
// Options:
//   minMatchRatio  share of search words that must appear in the job name (default 0.6)
//   maxYears       reject jobs requiring MORE than this many years of experience (default 2)
//   allowSenior    keep senior / mid-level / management titles (default false)
//   limit          max verified jobs to return (default 1; resolveJobLink always uses 1)
//   maxCandidates  max candidates to examine on a company page (default 8)
//   exclude        URLs to skip (e.g. jobs already shown)
//   expandCompany  for a specific job link, also return the company's other matching jobs (default true)
//   stats          optional object; counts why jobs were dropped (for logging)

const FETCH_TIMEOUT_MS = 6000;
const MAX_ATTEMPTS = 2;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

const pageCache = new Map(); // url -> { time, promise }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- URL parsing

// The URL length decides what kind of page we were given.
// Segments are counted the same way you read the link, domain included:
//
//   www.comeet.com / jobs / company / companyUid                         -> 4 segments
//   => fewer than 6: NOT a job page (a page listing many jobs, or the
//      application page). We have to search it for the matching job link.
//
//   www.comeet.com / jobs / company / companyUid / job-slug / positionUid -> 6 segments
//   => 6 or more: a link to one specific job.
const MIN_URL_SEGMENTS_FOR_JOB_PAGE = 6;

function countUrlSegments(u) {
  return 1 + u.pathname.split('/').filter(Boolean).length; // 1 = the domain
}

// https://www.comeet.com/jobs/<slug>/<companyUid>[/<jobSlug>/<positionUid>]
function parseComeetUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!/(^|\.)comeet\.com$/i.test(u.hostname)) return null;

    const parts = u.pathname.split('/').filter(Boolean);
    // Even a short URL needs at least /jobs/<company>/<companyUid>,
    // otherwise there is no company page to search in.
    if (parts.length < 3 || parts[0].toLowerCase() !== 'jobs') return null;

    const [, slug, companyUid, jobSlug, positionUid] = parts;
    const base = `https://www.comeet.com/jobs/${slug}/${companyUid}`;
    const isJob = countUrlSegments(u) >= MIN_URL_SEGMENTS_FOR_JOB_PAGE;

    return {
      slug,
      companyUid,
      jobSlug: isJob ? jobSlug : null,
      positionUid: isJob ? positionUid : null,
      companyUrl: base,
      jobUrl: isJob ? `${base}/${jobSlug}/${positionUid}` : null,
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- fetching

async function fetchHtmlOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    // Retryable: rate limit / server errors. Other 4xx: give up immediately.
    if (res.status === 429 || res.status >= 500) return { retry: true };
    if (!res.ok) return { retry: false, html: null };
    return { retry: false, html: await res.text() };
  } catch {
    return { retry: true }; // network error or timeout
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(url) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await fetchHtmlOnce(url);
    if (!result.retry) return result.html;
    if (attempt < MAX_ATTEMPTS) await sleep(400 * attempt);
  }
  return null;
}

// Cached by URL (the promise itself is cached, so concurrent requests for the
// same page share one download). Failures are not cached.
function getPage(url) {
  const now = Date.now();
  const hit = pageCache.get(url);
  if (hit && now - hit.time < CACHE_TTL_MS) return hit.promise;

  if (pageCache.size >= CACHE_MAX_ENTRIES) {
    pageCache.delete(pageCache.keys().next().value);
  }

  const promise = fetchHtml(url).then((html) => {
    if (html === null) pageCache.delete(url);
    return html;
  });
  pageCache.set(url, { time: now, promise });
  return promise;
}

// -------------------------------------------------- extracting embedded JSON

// Finds the index of the bracket that closes the JSON value starting at `start`.
function findJsonEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Reads `NAME = <json>;` out of the page. Returns the parsed value
// (object / array / null), or undefined if the variable wasn't found or parsed.
function extractAssignedJson(html, name) {
  const re = new RegExp(`(?:^|[\\s;])${name}\\s*=\\s*`, 'g');
  let m;
  while ((m = re.exec(html))) {
    const start = m.index + m[0].length;
    if (html.startsWith('null', start)) return null;
    const first = html[start];
    if (first !== '{' && first !== '[') continue;
    const end = findJsonEnd(html, start);
    if (end === -1) continue;
    try {
      return JSON.parse(html.slice(start, end + 1));
    } catch {
      // keep looking
    }
  }
  return undefined;
}

// ------------------------------------------------------ experience detection

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  // עברית (זכר ונקבה)
  'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5,
  'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8,
  'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10,
};
const NUM = '\\d{1,2}|' + Object.keys(WORD_NUMBERS).join('|');
// "3 years", "3+ years", "3-5 years", "three years", "3 שנות", "4 שנים"
const YEARS_RE = new RegExp(
  `(?<![a-zA-Z\\d.])(${NUM})\\s*(?:\\+|(?:-|–|to)\\s*(?:${NUM}))?\\s*\\+?\\s*(?:years?|yrs?|שנים|שנות|שנה)`,
  'gi'
);
const EXPERIENCE_WORD_RE = /experience|experienced|ניסיון|נסיון|years?\s+of\b/i;
// Lines that describe a nice-to-have shouldn't disqualify a job.
const ADVANTAGE_RE = /advantage|a plus|nice to have|bonus|preferred|desirable|יתרון|רצוי/i;
const REQUIREMENTS_SECTION_RE = /requirement|qualification|דרישות|כישורים|skills/i;

function htmlToLines(html) {
  return String(html || '')
    .replace(/<\s*(?:br|\/p|\/li|\/div|\/h\d|\/ul|\/ol)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#?\w+;/g, ' ')
    .split('\n');
}

// Highest number of years of experience the job explicitly requires (0 if none found).
// For ranges ("3-5 years") the lower bound is used.
export function getRequiredYears(position) {
  const sections = position?.custom_fields?.details;
  if (!Array.isArray(sections)) return 0;

  // Only look at the requirements sections, so sentences like
  // "our company has 10 years of experience" in the description don't count.
  const relevant = sections.filter((s) => s && s.value && REQUIREMENTS_SECTION_RE.test(s.name || ''));
  const chosen = relevant.length ? relevant : sections;

  let max = 0;
  for (const section of chosen) {
    for (const line of htmlToLines(section && section.value)) {
      if (!EXPERIENCE_WORD_RE.test(line) && !/שנתיים/.test(line)) continue;
      if (ADVANTAGE_RE.test(line)) continue;

      if (/שנתיים/.test(line)) max = Math.max(max, 2);

      for (const m of line.matchAll(YEARS_RE)) {
        const raw = m[1].toLowerCase();
        const years = /^\d+$/.test(raw) ? Number(raw) : WORD_NUMBERS[raw];
        if (years) max = Math.max(max, years);
      }
    }
  }
  return max;
}

// ------------------------------------------------------------------- matching

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function isValidComeetJobUrl(value) {
  const parsed = typeof value === 'string' ? parseComeetUrl(value) : null;
  return Boolean(parsed && parsed.jobUrl);
}

const wordRe = (alternatives) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'u');

// Tested on normalized text (punctuation became spaces: "ג'וניור" -> "ג וניור").
const JUNIOR_RE = wordRe('junior|jr|entry|intern|graduate|student|סטודנט|סטודנטית|גוניור|ג וניור');
const SENIOR_RE = wordRe(
  'senior|sr|lead|principal|staff|manager|director|head|vp|architect|mid|midlevel|expert|בכיר|בכירה|מנהל|מנהלת|ראש'
);
const SENIOR_LEVEL_RE = /mid|senior|lead|manager|director|executive|expert|experienced/i;

function looksJunior(p) {
  const hay = `${normalize(p.name)} ${normalize(p.position_slug)}`;
  return JUNIOR_RE.test(hay) || /entry|junior/i.test(p.experience_level || '');
}

// Senior / mid-level / management roles (judged by title and Comeet's experience_level).
// A title that also says "junior" is never considered too senior.
export function isTooSenior(p) {
  if (!p || looksJunior(p)) return false;
  const hay = `${normalize(p.name)} ${normalize(p.position_slug)}`;
  return SENIOR_RE.test(hay) || SENIOR_LEVEL_RE.test(p.experience_level || '');
}

// How many of the search words appear in the job's name.
// "full stack", "fullstack" and "full-stack" are all treated as the same thing.
function titleHits(p, words, phrase) {
  const spaced = ` ${normalize(p.name)} ${normalize(p.position_slug)} `;
  const compact = spaced.replace(/ /g, '');

  if (phrase.length >= 4 && compact.includes(phrase)) return words.length;

  return words.filter(
    (w) => spaced.includes(` ${w}`) || (w.length >= 4 && compact.includes(w))
  ).length;
}

// Returns the positions matching the search words, best first.
// Ranking: more matched words first, then junior roles, then original order.
export function matchByTitle(positions, jobTitle, minMatchRatio = 0.6) {
  const words = normalize(jobTitle).split(' ').filter(Boolean);
  if (words.length === 0) return positions;

  const phrase = words.join('');
  const needed = Math.max(1, Math.ceil(words.length * minMatchRatio));

  return positions
    .map((p, index) => ({
      p,
      hits: titleHits(p, words, phrase),
      index,
      junior: looksJunior(p) ? 1 : 0,
    }))
    .filter((x) => x.hits >= needed)
    .sort((a, b) => b.hits - a.hits || b.junior - a.junior || a.index - b.index)
    .map((x) => x.p);
}

// ---------------------------------------------------------------- main logic

function toResult(position, fallbackUrl) {
  return {
    url: isValidComeetJobUrl(position.url_active_page) ? position.url_active_page : fallbackUrl,
    title: position.name || '',
  };
}

// Why a job should not be shown (or null if it is fine).
function rejectReason(position, maxYears, allowSenior) {
  if (!allowSenior && isTooSenior(position)) return 'tooSenior';
  if (getRequiredYears(position) > maxYears) return 'tooMuchExperience';
  return null;
}

// Re-opens the candidate's own page and confirms it is the right, open, junior-suitable job.
async function verifyCandidate(candidate, check, bump) {
  const html = await getPage(candidate.url_active_page);
  if (!html) {
    bump('fetchFailed');
    return null;
  }

  const fresh = extractAssignedJson(html, 'POSITION_DATA');
  if (!fresh || String(fresh.uid).toLowerCase() !== String(candidate.uid).toLowerCase()) {
    bump('closedJob');
    return null;
  }

  const reason = check(fresh);
  if (reason) {
    bump(reason);
    return null;
  }

  return toResult(fresh, candidate.url_active_page);
}

export async function resolveJobs(url, jobTitle = '', options = {}) {
  const {
    minMatchRatio = 0.6,
    maxYears = 2,
    limit = 1,
    maxCandidates = 8,
    exclude = [],
    allowSenior = false,
    expandCompany = true,
    stats = null,
  } = options;

  const bump = (key) => {
    if (stats) stats[key] = (stats[key] || 0) + 1;
  };
  const check = (position) => rejectReason(position, maxYears, allowSenior);

  try {
    const parsed = parseComeetUrl(url);
    if (!parsed) {
      bump('unusableUrl');
      return [];
    }

    const results = [];
    const seen = new Set(exclude);
    const add = (result) => {
      if (!result || seen.has(result.url)) return;
      seen.add(result.url);
      results.push(result);
    };

    let positions = null; // the company's list of open jobs, once we have it

    // 1) A long URL (6+ segments) is a link to one specific job: verify that job.
    if (parsed.jobUrl) {
      const html = await getPage(parsed.jobUrl);
      if (html) {
        const position = extractAssignedJson(html, 'POSITION_DATA');
        if (
          position &&
          String(position.uid).toLowerCase() === parsed.positionUid.toLowerCase()
        ) {
          const relevant = matchByTitle([position], jobTitle, minMatchRatio).length > 0;
          const reason = check(position);
          if (!relevant) bump('notRelevant');
          else if (reason) bump(reason);
          else add(toResult(position, parsed.jobUrl));
        } else {
          bump('closedJob');
          // Comeet redirected us to the company page, which already holds the list.
          const list = extractAssignedJson(html, 'COMPANY_POSITIONS_DATA');
          if (Array.isArray(list)) positions = list;
        }
      } else {
        bump('fetchFailed');
      }
    }

    // 2) A short URL (fewer than 6 segments) isn't a job page, so search the
    //    company page for the matching jobs. A long URL does this too, because
    //    the same company often has other matching jobs.
    const wantMore = results.length < limit;
    if (wantMore && (!parsed.jobUrl || expandCompany)) {
      if (!positions) {
        const html = await getPage(parsed.companyUrl);
        const list = html && extractAssignedJson(html, 'COMPANY_POSITIONS_DATA');
        if (Array.isArray(list)) positions = list;
        else bump('noCompanyList');
      }

      if (positions) {
        const open = positions.filter((p) => p && isValidComeetJobUrl(p.url_active_page));
        const matching = matchByTitle(open, jobTitle, minMatchRatio);
        if (matching.length === 0) bump('companyHasNoMatch');

        const candidates = matching
          .filter((p) => {
            if (seen.has(p.url_active_page)) return false;
            const reason = check(p);
            if (reason) bump(reason);
            return !reason;
          })
          .slice(0, maxCandidates);

        // 3) Re-open each candidate (best match first) until we have enough.
        // (3 at a time, in parallel - each one is a separate page download)
        for (let i = 0; i < candidates.length && results.length < limit; i += 3) {
          const chunk = candidates.slice(i, i + 3);
          const verified = await Promise.all(chunk.map((c) => verifyCandidate(c, check, bump)));
          for (const v of verified) {
            if (results.length < limit) add(v);
          }
        }
      }
    }

    return results.slice(0, limit);
  } catch {
    bump('unexpectedError');
    return [];
  }
}

export async function resolveJobLinks(url, jobTitle = '', options = {}) {
  const jobs = await resolveJobs(url, jobTitle, { ...options, limit: options.limit ?? Infinity });
  return jobs.map((j) => j.url);
}

// Returns one verified, direct job link, or false if none could be found.
export async function resolveJobLink(url, jobTitle = '', options = {}) {
  const jobs = await resolveJobs(url, jobTitle, { ...options, limit: 1 });
  return jobs.length > 0 ? jobs[0].url : false;
}
