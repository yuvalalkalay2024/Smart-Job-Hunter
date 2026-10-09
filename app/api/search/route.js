import { NextResponse } from 'next/server';
import Fuse from 'fuse.js';

function extractCompanyName(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    // ברוב המערכות האחרות (Greenhouse, Lever, Ashby, Workable) החברה היא החלק הראשון בנתיב
    if (pathParts.length >= 1) return pathParts[0];
  } catch (e) {
    return "Unknown";
  }
  return "Unknown";
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const jobsCache = [];

function makeCacheKey(jobTitle, start) {
  const normalized = String(jobTitle ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  return `${normalized}:${start}`;
}

function getCachedJobs(key) {
  const now = Date.now();
  const index = jobsCache.findIndex((entry) => entry.key === key);
  if (index === -1) return null;
  if (jobsCache[index].expiresAt <= now) {
    jobsCache.splice(index, 1);
    return null;
  }
  return jobsCache[index].jobs;
}

function setCachedJobs(key, jobs) {
  const now = Date.now();
  for (let i = jobsCache.length - 1; i >= 0; i--) {
    if (jobsCache[i].expiresAt <= now) jobsCache.splice(i, 1);
  }

  const entry = { key, jobs, expiresAt: now + CACHE_TTL_MS };
  const existing = jobsCache.findIndex((item) => item.key === key);
  if (existing === -1) jobsCache.push(entry);
  else jobsCache[existing] = entry;

  while (jobsCache.length > CACHE_MAX_ENTRIES) {
    let oldest = 0;
    for (let i = 1; i < jobsCache.length; i++) {
      if (jobsCache[i].expiresAt < jobsCache[oldest].expiresAt) oldest = i;
    }
    jobsCache.splice(oldest, 1);
  }
}

async function fetchJobsFromGoogle(jobTitle, start = 0) {
  const cacheKey = makeCacheKey(jobTitle, start);
  const cached = getCachedJobs(cacheKey);
  if (cached) {
    console.log(`Cache hit for comeet with start=${start}:`, jobTitle);
    return cached.map((job) => ({ ...job }));
  }

  const apiKey = process.env.SERPAPI_KEY; 
  
  let query = [`site:www.comeet.com/jobs junior ${jobTitle} Israel`];

  console.log(`Executing query for comeet with start=${start}:`, query);
  
  // הוספנו את פרמטר &start= ל-URL
  const url = `https://serpapi.com/search.json?hebrew=google&q=${encodeURIComponent(query)}&api_key=${apiKey}&num=20&start=${start}`;

  console.log(url);
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("Error fetching from SerpApi:", data.error || response.status);
      return [];
    }

    const jobs = (data.organic_results || []).map(result => ({
      title: result.title.replace(/\s*[-–|]?\s*Comeet\s*/gi, ' ').trim(),
      url: result.link
    }));

    setCachedJobs(cacheKey, jobs);
    return jobs;
  } catch (error) {
    console.error("Error fetching from SerpApi:", error);
    return [];
  }
}

export async function POST(request) {
  try {
    // קבלת פרמטר start מהממשק (ברירת מחדל 0)
    const { jobTitle, connectionsData, start = 0 } = await request.json();
    let allJobs = [];

      // העברת start לפונקציה
      const rawResults = await fetchJobsFromGoogle(jobTitle, start);
      
      const processedResults = rawResults.map(job => ({
        ...job,
        company: extractCompanyName(job.url)
      }));
      
      allJobs.push(...processedResults);

    if (connectionsData && connectionsData.length > 0) {
      // 1. החזרנו את הרגישות ל-0.3 לדיוק גבוה יותר
      const fuse = new Fuse(connectionsData, {
        keys: ['Company'],
        threshold: 0.3, 
        ignoreLocation: true
      });

      allJobs = allJobs.map(job => {
        const cleanName = job.company.replace(/[-_]/g, ' ');
        const coreName = job.company.split(/[-_]/)[0]; 

        // 2. חסימת מילים קצרות: אם שם החברה מהלינק הוא 2 אותיות ומטה (למשל hr, it, ai)
        // אנחנו מדלגים עליו כדי לא ליצור התאמות שווא הזויות.
        if (coreName.length <= 2) {
          return { ...job, hasConnection: false };
        }

        let match = fuse.search(cleanName);
        
        if (match.length === 0) {
          match = fuse.search(coreName);
        }

        if (match.length === 0) {
          const hardMatch = connectionsData.find(conn => {
            if (!conn['Company']) return false;
            const linkedinCompany = conn['Company'];
            const extractedCore = coreName;
            
            // 3. ביטוי רגולרי חכם: בודק שהמילה מופיעה כמילה שלמה ולא כחלק ממילה אחרת
            try {
              // ה-\b אומר Word Boundary (גבול מילה). ה-i אומר Case Insensitive (לא רגיש לאותיות גדולות/קטנות).
              const regex = new RegExp(`\\b${extractedCore}\\b`, 'i');
              return regex.test(linkedinCompany);
            } catch (e) {
              return false;
            }
          });

          if (hardMatch) {
            match = [{ item: hardMatch }];
          }
        }

        if (match.length > 0) {
          return {
            ...job,
            hasConnection: true,
            connectionDetails: {
              firstName: match[0].item['First Name'],
              lastName: match[0].item['Last Name'],
              connectionPosition: match[0].item['Position'],
              linkedinCompany: match[0].item['Company']
            }
        } }else {
          return { ...job };
        }
    });
    }

    return NextResponse.json({ success: true, data: allJobs });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}