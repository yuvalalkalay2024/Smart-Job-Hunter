// Run with:  node scripts/test-resolveJobLink.mjs
import { resolveJobLink, resolveJobLinks } from '../lib/resolveJobLink.js';

const cases = [
  ['job page that exists', 'https://www.comeet.com/jobs/inmanage/B7.006/junior-backend-developer-php/A8.A20', '', 'link'],
  ['job page + tracking params', 'https://www.comeet.com/jobs/inmanage/B7.006/junior-backend-developer-php/A8.A20?utm_source=x#top', '', 'link'],
  ['company page, matching title', 'https://www.comeet.com/jobs/inmanage/B7.006', 'junior backend', 'link'],
  ['company page, no matching title', 'https://www.comeet.com/jobs/inmanage/B7.006', 'astronaut', false],
  // 4 segments (domain + jobs/company/uid) -> shorter than 6 -> not a job page -> search it
  ['short url (4 segments) -> searched for matching job', 'https://www.comeet.com/jobs/inmanage/B7.006', 'junior backend', 'link'],
  // 5 segments (domain + jobs/company/uid/slug) -> still shorter than 6 -> search
  ['5 segments -> still treated as not a job page', 'https://www.comeet.com/jobs/inmanage/B7.006/junior-backend-developer-php', 'junior backend', 'link'],
  ['short url, nothing matches the title', 'https://www.comeet.com/jobs/inmanage/B7.006', 'astronaut', false],
  ['closed job -> falls back to the matching job of the same company', 'https://www.comeet.com/jobs/inmanage/B7.006/fake-job/ZZ.999', 'junior backend', 'link'],
  ['closed job and nothing matches the title', 'https://www.comeet.com/jobs/inmanage/B7.006/fake-job/ZZ.999', 'astronaut', false],
  ['job that exists but is not what was searched', 'https://www.comeet.com/jobs/inmanage/B7.006/junior-backend-developer-php/A8.A20', 'astronaut', false],
  ['company that does not exist', 'https://www.comeet.com/jobs/nosuchcompanyxyz/00.000', 'developer', false],
  ['not a comeet url', 'https://example.com/jobs/a/b', 'developer', false],
  ['garbage input', 'not a url', 'developer', false],
];

let failed = 0;
for (const [name, url, title, expected] of cases) {
  const result = await resolveJobLink(url, title);
  const ok = expected === 'link' ? typeof result === 'string' : result === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      -> ${result}`);
}

console.log('\nAll matches for "junior" at inmanage:');
console.log(await resolveJobLinks('https://www.comeet.com/jobs/inmanage/B7.006', 'junior'));

console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
