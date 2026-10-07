"use client";
import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { useSession, signIn, signOut } from "next-auth/react";

export default function Home() {
  const { data: session, status } = useSession();
  const [isMounted, setIsMounted] = useState(false);
  const [results, setResults] = useState([]);
  const [jobTitle, setJobTitle] = useState('');
  
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

// הוסף את המשתנים האלו מתחת ל-useState האחרים שלך:
  const [startIndex, setStartIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false); // יודע אם להציג את כפתור "טען עוד"
  const [loadingMore, setLoadingMore] = useState(false);

  // פונקציה כללית לשליפת משרות
  const fetchJobs = async (currentStart, isLoadMore = false) => {
    
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: jobTitle,
          start: currentStart // שליחת המיקום שממנו ממשיכים לחפש
        })
      });
      const data = await response.json();
      
      if (data.data.length > 0) {
        if (isLoadMore) {
          // חיבור התוצאות החדשות לתוצאות הקיימות
          setResults(prev => [...prev, ...data.data]);
        } else {
          // חיפוש חדש - החלפת התוצאות
          setResults(data.data);
        }
        setHasMore(true); // מניחים שיש עוד עמוד
      } else {
        // אם לא חזרו תוצאות, כנראה הגענו לסוף
        if (!isLoadMore) setResults([]);
        setHasMore(false); 
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
    
    setLoading(false);
    setLoadingMore(false);
  };

  // כפתור חיפוש רגיל (מתחיל מאפס)
  const handleSearch = () => {
    setStartIndex(0);
    fetchJobs(0, false);
  };

  // כפתור טען עוד (מוסיף 20 לאינדקס הקיים)
  const handleLoadMore = () => {
    const nextStart = startIndex + 20;
    setStartIndex(nextStart);
    fetchJobs(nextStart, true);
  };

  if (!isMounted) return null; 

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-xl">טוען...</div>;
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <h1 className="text-5xl font-bold text-gray-900 mb-6 text-center">Smart Job Hunter 🚀</h1>
        <p className="text-xl text-gray-600 mb-10 text-center max-w-2xl">
          מנוע חיפוש המשרות החכם שלך. מוצא משרות מתחת לרדאר בחברות ישראליות, 
          ומצליב אותן אוטומטית עם רשת הלינקדאין שלך כדי למצוא ממליצים.
        </p>
        <button 
          onClick={() => signIn('google')} 
          className="bg-white border border-gray-300 text-gray-700 px-8 py-4 rounded-xl shadow-md hover:bg-gray-50 flex items-center gap-4 text-lg font-semibold transition"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-6 h-6" />
          התחבר עם Google כדי להתחיל
        </button>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-4xl mx-auto font-sans text-gray-800">
      {/* אזור פרופיל משתמש ויציאה */}
      <div className="flex justify-end items-center gap-4 mb-8 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <img 
            src={session.user.image} 
            alt="Profile" 
            className="w-10 h-10 rounded-full border-2 border-gray-100" 
          />
          <span className="text-sm font-semibold text-gray-700">
            שלום, {session.user.name}
          </span>
        </div>
        
        <button 
          onClick={() => signOut()} 
          className="text-sm bg-red-50 text-red-600 px-5 py-2 rounded-lg font-semibold hover:bg-red-100 transition-colors border border-red-100"
        >
          יציאה
        </button>
      </div>
      <h1 className="text-3xl font-bold mb-8 text-black">מנוע חיפוש משרות + נטוורקינג</h1>
      
      <div className="bg-gray-100 p-6 rounded-lg mb-8 shadow-sm">
        
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">איזה תפקיד אתה מחפש?</label>
          <input 
            type="text" 
            placeholder="לדוגמה: Full Stack / Embedded"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                  handleSearch();
            }}
            className="border p-2 rounded w-full md:w-1/2 text-black bg-white"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">הצלבת קשרים מלינקדאין (אופציונלי)</label>
          <input 
            type="file" 
            accept=".csv"
            onChange={handleFileUpload}
            className="text-sm"
          />
          {connections && <span className="text-green-600 text-sm ml-2 font-semibold">נטען בהצלחה!</span>}
        </div>

        <button 
          onClick={handleSearch}
          disabled={loading || jobTitle.trim() === ''}
          className="bg-blue-600 text-white px-8 py-3 rounded font-semibold disabled:opacity-50 hover:bg-blue-700 transition"
        >
          {loading ? 'מבצע סריקה...' : 'התחל חיפוש'}
        </button>
      </div>

      {results && results.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mt-8">
          <h2 className="text-xl font-bold mb-4 text-black">
            תוצאות חיפוש ({results.length} משרות)
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-right border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th className="p-3 font-semibold text-gray-700">שם החברה</th>
                  <th className="p-3 font-semibold text-gray-700">תפקיד</th>
                  <th className="p-3 font-semibold text-gray-700">קשר (Referral)</th>
                  <th className="p-3 font-semibold text-gray-700">קישור</th>
                </tr>
              </thead>
              <tbody>
                {results.map((job, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-blue-50">
                    <td className="p-3 font-bold text-gray-800">{job.company}</td>
                    <td className="p-3 text-gray-700">{job.title}</td>
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
                      <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm font-semibold">
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
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg font-semibold disabled:opacity-50 hover:bg-gray-300 transition"
              >
                {loadingMore ? 'טוען משרות נוספות...' : 'טען משרות נוספות'}
              </button>
            </div>
      )}
          </div>
        </div>
      )}
    </main>
  );
}