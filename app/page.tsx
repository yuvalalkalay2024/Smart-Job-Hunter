"use client";
import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { useSession, signIn, signOut } from "next-auth/react";
import { JobFilters, CATEGORIES, emptySelection } from "./components/JobFilterSearch";

// מצב של חיפוש אחד (שאילתה אחת): איזו אפשרות הפעילה אותו, איפה הוא עומד, והאם יש עוד
// משרה אחת בטבלת התוצאות
interface Job {
  company: string;
  title: string;
  url: string;
  searchLabels: string[]; // האפשרויות שסומנו והחזירו את המשרה הזו
  hasConnection?: boolean;
  connectionDetails: { firstName: string; lastName: string; connectionPosition: string };
}

type SearchState = { label: string | null; start: number; hasMore: boolean };

export default function Home() {
  const { data: session, status } = useSession();
  const [isMounted, setIsMounted] = useState(false);
  const [results, setResults] = useState<Job[]>([]);
  const [jobTitle, setJobTitle] = useState('');
  const [selectedFilters, setSelectedFilters] = useState(emptySelection); // סינון לפי סוגי משרות
  
  const [connections, setConnections] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const csvText = event.target.result;
        // פיצול הקובץ לשורות
        const lines = csvText.split('\n');
        
        // חיפוש השורה שבה מתחילות הכותרות האמיתיות של לינקדאין
        const headerIndex = lines.findIndex(line => line.startsWith('First Name'));
        
        if (headerIndex !== -1) {
          // חיתוך הקובץ כך שיתחיל מהכותרות ויתעלם משורות ההערה
          const cleanCsvText = lines.slice(headerIndex).join('\n');
          
          Papa.parse(cleanCsvText, {
            header: true,
            skipEmptyLines: true, // מדלג על שורות ריקות
            complete: (results) => {
              setConnections(results.data);
              console.log("✅ CSV Loaded successfully! Total rows:", results.data.length);
              
              // הוספנו פילטר שבודק אם אברא קיימת בזיכרון של הדפדפן
              const abraTest = results.data.filter(row => 
                row['Company'] && row['Company'].toLowerCase().includes('abra')
              );
              console.log("🔍 Frontend CSV test for 'abra':", abraTest);
            },
            error: (error) => {
              console.error("Error parsing CSV:", error);
            }
          });
        } else {
          alert("קובץ ה-CSV לא נראה כמו קובץ קשרים תקין של לינקדאין.");
          setConnections(null);
        }
      };
      
      reader.readAsText(file);
    } else {
      setConnections(null);
    }
  };

  // כל חיפוש (שאילתה אחת) זוכר לבד איפה הוא עומד, כדי ש"טען עוד" ימשיך מאותו מקום
  const [searches, setSearches] = useState<Record<string, SearchState>>({});
  const [loadingMore, setLoadingMore] = useState(false);

  // יש עוד תוצאות אם לפחות אחד מהחיפושים עדיין לא הסתיים
  const hasMore = Object.values(searches).some(s => s.hasMore);

  // כל סוגי המשרות שסומנו בכל הקטגוריות
  const selectedTypes = [...new Set(CATEGORIES.flatMap(category => selectedFilters[category.id]))];

  // אפשר לחפש אם כתבת תפקיד או סימנת לפחות אפשרות אחת
  const canSearch = selectedTypes.length > 0 || jobTitle.trim() !== '';

  // כל אפשרות שסומנה היא חיפוש נפרד. אם הוקלד גם טקסט - הוא מצטרף לכל חיפוש.
  const buildQueries = () => {
    const text = jobTitle.trim();
    if (selectedTypes.length === 0) return [{ query: text, label: null, start: 0 }];
    return selectedTypes.map(type => ({
      query: `${text} ${type}`.trim(),
      label: type,
      start: 0
    }));
  };

  // שליפת משרות: חיפוש נפרד לכל אפשרות, כולם במקביל
  const fetchJobs = async (isLoadMore = false) => {

    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      // בחיפוש חדש - כל האפשרויות. ב"טען עוד" - רק חיפושים שיש להם עוד תוצאות
      const targets = isLoadMore
        ? Object.entries(searches)
            .filter(([, s]) => s.hasMore)
            .map(([query, s]) => ({ query, label: s.label, start: s.start + 20 }))
        : buildQueries();

      const responses = await Promise.all(
        targets.map(async (target) => {
          try {
            const response = await fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobTitle: target.query,
                start: target.start, // המקום שממנו ממשיכים לחפש
                connectionsData: connections
              })
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error);
            return { ...target, jobs: data.data as Job[], ok: true, error: undefined as Error | undefined };
          } catch (error) {
            // חיפוש אחד שנכשל לא מפיל את האחרים
            console.error(`Search failed for "${target.query}":`, error);
            return { ...target, jobs: [] as Job[], ok: false, error: error as Error };
          }
        })
      );

      if (responses.every(r => !r.ok)) {
        alert("החיפוש נכשל: " + (responses[0]?.error?.message || "שגיאה לא ידועה"));
      }

      // איחוד התוצאות. אותה משרה יכולה להופיע בכמה חיפושים - מציגים אותה פעם אחת
      // ורושמים לידה את כל האפשרויות שהחזירו אותה.
      const merged = new Map<string, Job>(isLoadMore ? results.map(job => [job.url, job] as [string, Job]) : []);
      for (const r of responses) {
        for (const job of r.jobs) {
          const existing = merged.get(job.url);
          if (existing) {
            if (r.label && !existing.searchLabels.includes(r.label)) {
              merged.set(job.url, { ...existing, searchLabels: [...existing.searchLabels, r.label] });
            }
          } else {
            merged.set(job.url, { ...job, searchLabels: r.label ? [r.label] : [] });
          }
        }
      }
      setResults([...merged.values()]);

      // שומרים לכל חיפוש איפה הוא עומד. אם לא חזרו תוצאות - הגענו לסוף שלו.
      const updates: Record<string, SearchState> = {};
      for (const r of responses) {
        updates[r.query] = { label: r.label, start: r.start, hasMore: r.ok && r.jobs.length > 0 };
      }
      setSearches(prev => (isLoadMore ? { ...prev, ...updates } : updates));
    } catch (error) {
      console.error('Search failed:', error);
    }

    setLoading(false);
    setLoadingMore(false);
  };

  // כפתור חיפוש רגיל (מתחיל מאפס)
  const handleSearch = () => {
    if (!canSearch) return;
    fetchJobs(false);
  };

  // כפתור טען עוד (ממשיך בכל חיפוש מהמקום שבו הוא עצר)
  const handleLoadMore = () => {
    fetchJobs(true);
  };

  if (!isMounted) return null; 

  if (status === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center text-xl" role="status" aria-live="polite">
        טוען...
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-gray-50 p-4">
        <h1 className="mb-6 w-full text-center text-5xl font-bold">
          <span className="text-orange-500">Mitzi</span>{" "}
          <span className="text-blue-500">Jobs</span>
        </h1>
        <p className="text-xl text-gray-600 mb-10 text-center max-w-2xl">
          מנוע חיפוש המשרות החכם שלך. מוצא משרות מתחת לרדאר בחברות ישראליות, 
          ומצליב אותן אוטומטית עם רשת הלינקדאין שלך כדי למצוא ממליצים.
        </p>
        <button 
          type="button"
          onClick={() => signIn('google')} 
          className="bg-white border border-gray-300 text-gray-700 px-8 py-4 rounded-xl shadow-md hover:bg-gray-50 flex items-center gap-4 text-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="לוגו Google" className="w-6 h-6" />
          התחבר עם Google כדי להתחיל
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-8 font-sans text-gray-800">
      <header className="flex justify-end items-center gap-4 mb-8 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <img 
            src={session.user.image} 
            alt={session.user?.name ? `תמונת הפרופיל של ${session.user.name}` : "תמונת פרופיל"}
            className="w-10 h-10 rounded-full border-2 border-gray-100" 
          />
          <span className="text-sm font-semibold text-gray-700">
            שלום, {session.user.name}
          </span>
        </div>
        
        <button 
          type="button"
          onClick={() => signOut()} 
          className="text-sm bg-red-50 text-red-600 px-5 py-2 rounded-lg font-semibold hover:bg-red-100 transition-colors border border-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          יציאה
        </button>
      </header>
      <h1 className="my-4 w-full text-center text-3xl font-bold">
        <span className="text-orange-500">Mitzi</span>{" "}
        <span className="text-blue-500">Jobs</span>
      </h1>
      
      <section aria-label="חיפוש משרות" className="bg-gray-100 p-6 rounded-lg mb-8 shadow-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
        >
        <div className="mb-6">
          <label htmlFor="job-title" className="block text-sm font-semibold mb-2">איזה תפקיד אתה מחפש?</label>
          <input 
            id="job-title"
            type="text" 
            placeholder="לדוגמה: Full Stack / Embedded"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="border p-2 rounded w-full md:w-1/2 text-black bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* סינון לפי סוגי משרות - מתחת לשורת החיפוש */}
        <div className="mb-6">
          <JobFilters selected={selectedFilters} onChange={setSelectedFilters} />
        </div>

        <div className="mb-6">
          <label htmlFor="connections-file" className="block text-sm font-semibold mb-2">הצלבת קשרים מלינקדאין (אופציונלי)</label>
          <input 
            id="connections-file"
            type="file" 
            accept=".csv"
            onChange={handleFileUpload}
            className="text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {connections && <span className="text-green-600 text-sm ml-2 font-semibold">נטען בהצלחה!</span>}
        </div>

        <button 
          type="submit"
          disabled={loading || !canSearch}
          className="bg-blue-600 text-white px-8 py-3 rounded font-semibold disabled:opacity-50 hover:bg-blue-700 transition focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2"
        >
          {loading ? 'מבצע סריקה...' : 'התחל חיפוש'}
        </button>
        </form>
      </section>

      {results && results.length > 0 && (
        <section aria-label="תוצאות חיפוש" className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mt-8">
          <h2 className="text-xl font-bold mb-4 text-black">
            תוצאות חיפוש ({results.length} משרות)
          </h2>
          {Object.values(searches).some(s => s.label) && (
            <p className="text-sm text-gray-500 mb-4">
              {Object.values(searches).map(s => s.label).filter((label): label is string => !!label).map(label =>
                `${label}: ${results.filter(job => job.searchLabels?.includes(label)).length}`
              ).join(" · ")}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-right border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th scope="col" className="p-3 font-semibold text-gray-700">שם החברה</th>
                  <th scope="col" className="p-3 font-semibold text-gray-700">תפקיד</th>
                  <th scope="col" className="p-3 font-semibold text-gray-700">קשר (Referral)</th>
                  <th scope="col" className="p-3 font-semibold text-gray-700">קישור</th>
                </tr>
              </thead>
              <tbody>
                {results.map((job, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-blue-50">
                    <td className="p-3 font-bold text-gray-800">{job.company}</td>
                    <td className="p-3 text-gray-700">
                      {job.title}
                      {job.searchLabels && job.searchLabels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {job.searchLabels.map(label => (
                            <span key={label} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {job.hasConnection ? (
                        <div className="flex flex-col items-start">
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-bold mb-1">
                            מצאנו קשר!
                          </span>
                          <span className="text-sm font-semibold text-gray-800">
                            {job.connectionDetails.firstName} {job.connectionDetails.lastName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {job.connectionDetails.connectionPosition}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">אין קשר ישיר</span>
                      )}
                    </td>
                    <td className="p-3">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`צפה במשרה ${job.title} בחברת ${job.company}, נפתח בחלון חדש`}
                        className="text-blue-600 hover:underline text-sm font-semibold rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        צפה במשרה
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
      {hasMore && (
        <div className="mt-6 flex justify-center">
              <button 
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg font-semibold disabled:opacity-50 hover:bg-gray-300 transition focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-offset-2"
              >
                {loadingMore ? 'טוען משרות נוספות...' : 'טען משרות נוספות'}
              </button>
            </div>
      )}
          </div>
        </section>
      )}
    </main>
  );
}