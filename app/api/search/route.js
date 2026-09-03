import { NextResponse } from 'next/server';
import Fuse from 'fuse.js';

function extractCompanyName(url, platform) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    // Comeet נשאר ללא שינוי בדיוק כמו שהיה
    if (platform.includes('comeet') && pathParts.length >= 2) return pathParts[1];
    
    // ברוב המערכות האחרות (Greenhouse, Lever, Ashby, Workable) החברה היא החלק הראשון בנתיב
    if (pathParts.length >= 1) return pathParts[0];
  } catch (e) {
    return "Unknown";
  }
  return "Unknown";
}

// ... (השאר את הפונקציה extractCompanyName כפי שהיא)

async function fetchJobsFromGoogle(jobTitle, platform, experienceLevel, yearsOfExperience, start = 0) {
  const apiKey = process.env.SERPAPI_KEY; 
  
  const location = platform.includes('comeet') ? '"Israel"' : '("Tel Aviv" OR "Israel")';
  let queryParts = [`site:${platform}`, `"${jobTitle}"`, location];

  if (experienceLevel) queryParts.push(`"${experienceLevel}"`);

  if (yearsOfExperience) {
    if (yearsOfExperience === '0-1') queryParts.push('("0 years" OR "junior")');
    else if (yearsOfExperience === '1-3') queryParts.push('("1 year" OR "2 years")');
    else if (yearsOfExperience === '3-5') queryParts.push('("3 years" OR "4 years")');
    else if (yearsOfExperience === '5+') queryParts.push('("5+ years")');
  }

  const query = queryParts.join(" ");
  console.log(`Executing query for ${platform} with start=${start}:`, query);
  
  // הוספנו את פרמטר &start= ל-URL
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${apiKey}&num=20&start=${start}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.organic_results && data.organic_results.length > 0) {
      return data.organic_results.map(result => ({
        title: result.title,
        url: result.link
      }));
    } else {
      return [];
    }
  } catch (error) {
    console.error("Error fetching from SerpApi:", error);
    return [];
  }
}

export async function POST(request) {
  try {
    // קבלת פרמטר start מהממשק (ברירת מחדל 0)
    const { jobTitle, platforms, connectionsData, experienceLevel, yearsOfExperience, start = 0 } = await request.json();
    let allJobs = [];

    for (const platform of platforms) {
      // העברת start לפונקציה
      const rawResults = await fetchJobsFromGoogle(jobTitle, platform, experienceLevel, yearsOfExperience, start);
      
      const processedResults = rawResults.map(job => ({
        ...job,
        company: extractCompanyName(job.url, platform),
        platform: platform
      }));
      
      allJobs.push(...processedResults);
    }

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
          };
        } else {
          return { ...job, hasConnection: false };
        }
      });
    }

    return NextResponse.json({ success: true, data: allJobs });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}