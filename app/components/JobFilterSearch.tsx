"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

/* -------------------------------------------------------------------------- */
/*  Types & mock data                                                         */
/* -------------------------------------------------------------------------- */

type CategoryId = "software" | "data" | "electrical" | "mechanical";

interface Category {
  id: CategoryId;
  title: string;
  options: string[];
}

interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  /** Job types this posting belongs to (a posting can match several). */
  types: string[];
}

interface JobResult extends Job {
  /** Which of the user's separate searches returned this job. */
  matchedTypes: string[];
}

export type Selection = Record<CategoryId, string[]>;

export const CATEGORIES: Category[] = [
  {
    id: "software",
    title: "תוכנה",
    options: ["Full Stack", "Embedded", "NOC", "QA", "Frontend", "Backend"],
  },
  {
    id: "data",
    title: "מדעי הנתונים",
    options: ["Data Analyst", "Data Scientist", "ML Engineer", "BI Developer"],
  },
  {
    id: "electrical",
    title: "הנדסת חשמל",
    options: ["Hardware Engineer", "FPGA", "Analog Design", "Power Electronics"],
  },
  {
    id: "mechanical",
    title: "הנדסת מכונות",
    options: ["Mechanical Design", "Product Engineer", "HVAC", "CAD Designer"],
  },
];

const JOB_DB: Job[] = [
  { id: 1, title: "Junior Full Stack Developer", company: "Wix", location: "תל אביב", types: ["Full Stack", "Frontend", "Backend"] },
  { id: 2, title: "Full Stack Engineer", company: "monday.com", location: "תל אביב", types: ["Full Stack"] },
  { id: 3, title: "Junior Backend Developer", company: "Riskified", location: "תל אביב", types: ["Backend"] },
  { id: 4, title: "React Frontend Developer", company: "Fiverr", location: "תל אביב", types: ["Frontend"] },
  { id: 5, title: "Embedded Software Engineer", company: "Elbit Systems", location: "חיפה", types: ["Embedded"] },
  { id: 6, title: "Junior Embedded Developer", company: "Mobileye", location: "ירושלים", types: ["Embedded", "Hardware Engineer"] },
  { id: 7, title: "NOC Engineer", company: "Check Point", location: "תל אביב", types: ["NOC"] },
  { id: 8, title: "Junior NOC Technician", company: "Bezeq", location: "פתח תקווה", types: ["NOC"] },
  { id: 9, title: "QA Automation Engineer", company: "Wix", location: "תל אביב", types: ["QA", "Backend"] },
  { id: 10, title: "Junior QA Engineer", company: "Payoneer", location: "פתח תקווה", types: ["QA"] },
  { id: 11, title: "Junior Data Analyst", company: "Taboola", location: "תל אביב", types: ["Data Analyst", "BI Developer"] },
  { id: 12, title: "Data Scientist", company: "Lemonade", location: "תל אביב", types: ["Data Scientist", "ML Engineer"] },
  { id: 13, title: "Machine Learning Engineer", company: "NVIDIA", location: "יוקנעם", types: ["ML Engineer"] },
  { id: 14, title: "BI Developer", company: "Playtika", location: "הרצליה", types: ["BI Developer", "Data Analyst"] },
  { id: 15, title: "Junior Hardware Engineer", company: "Intel", location: "חיפה", types: ["Hardware Engineer"] },
  { id: 16, title: "FPGA Design Engineer", company: "Rafael", location: "חיפה", types: ["FPGA", "Hardware Engineer"] },
  { id: 17, title: "Analog Design Engineer", company: "Tower Semiconductor", location: "מגדל העמק", types: ["Analog Design"] },
  { id: 18, title: "Power Electronics Engineer", company: "SolarEdge", location: "הרצליה", types: ["Power Electronics"] },
  { id: 19, title: "Mechanical Design Engineer", company: "Elbit Systems", location: "חיפה", types: ["Mechanical Design", "CAD Designer"] },
  { id: 20, title: "Junior Product Engineer", company: "Stratasys", location: "רחובות", types: ["Product Engineer"] },
  { id: 21, title: "HVAC Engineer", company: "Electra", location: "פתח תקווה", types: ["HVAC"] },
  { id: 22, title: "CAD Designer", company: "Plasan", location: "צפון", types: ["CAD Designer", "Mechanical Design"] },
];

export const emptySelection = (): Selection => ({
  software: [],
  data: [],
  electrical: [],
  mechanical: [],
});

const noneOpen = (): Record<CategoryId, boolean> => ({
  software: false,
  data: false,
  electrical: false,
  mechanical: false,
});

/* -------------------------------------------------------------------------- */
/*  Mock search - replace the body with a real fetch('/api/search', ...)      */
/* -------------------------------------------------------------------------- */

const MAX_CUSTOM_LENGTH = 40;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Simulates ONE search request for ONE job type (or only free text when
 * `jobType` is null). Each call has its own random latency, just like
 * independent network requests would.
 */
async function mockSearchJobs(jobType: string | null, freeText: string): Promise<Job[]> {
  await sleep(300 + Math.random() * 600);

  const text = freeText.trim().toLowerCase();
  return JOB_DB.filter((job) => {
    const matchesType = jobType === null || job.types.includes(jobType);
    const matchesText =
      text === "" || `${job.title} ${job.company}`.toLowerCase().includes(text);
    return matchesType && matchesText;
  });
}

/* -------------------------------------------------------------------------- */
/*  JobFilters - the 4 dropdowns (controlled; the parent owns the selection)  */
/* -------------------------------------------------------------------------- */

interface JobFiltersProps {
  selected: Selection;
  onChange: (next: Selection) => void;
}

export function JobFilters({ selected, onChange }: JobFiltersProps) {
  // Which dropdowns are open. Independent: toggling one never touches the others.
  const [open, setOpen] = useState<Record<CategoryId, boolean>>(noneOpen);

  // Free-text options the user added, per category (shown next to the built-in ones).
  const [custom, setCustom] = useState<Record<CategoryId, string[]>>(emptySelection);
  // What is currently typed in each category's "add option" input.
  const [drafts, setDrafts] = useState<Record<CategoryId, string>>({
    software: "",
    data: "",
    electrical: "",
    mechanical: "",
  });

  const selectedTypes = useMemo(
    () => CATEGORIES.flatMap((category) => selected[category.id]),
    [selected]
  );

  const toggleOpen = (id: CategoryId) =>
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleOption = (id: CategoryId, option: string) =>
    onChange({
      ...selected,
      [id]: selected[id].includes(option)
        ? selected[id].filter((o) => o !== option)
        : [...selected[id], option],
    });

  /** Local clear: only this category. */
  const clearCategory = (id: CategoryId) => onChange({ ...selected, [id]: [] });

  /**
   * Adds the typed text as a new option of this category and selects it.
   * If an option with the same name already exists, it is just selected.
   */
  const addCustomOption = (id: CategoryId) => {
    const value = drafts[id].trim().replace(/\s+/g, " ").slice(0, MAX_CUSTOM_LENGTH);
    if (!value) return;

    const category = CATEGORIES.find((c) => c.id === id);
    const existing = [...(category?.options ?? []), ...custom[id]].find(
      (option) => option.toLowerCase() === value.toLowerCase()
    );
    const name = existing ?? value;

    if (!existing) setCustom((prev) => ({ ...prev, [id]: [...prev[id], name] }));
    if (!selected[id].includes(name)) onChange({ ...selected, [id]: [...selected[id], name] });
    setDrafts((prev) => ({ ...prev, [id]: "" }));
  };

  /** Removes an option the user added (and un-selects it). */
  const removeCustomOption = (id: CategoryId, name: string) => {
    setCustom((prev) => ({ ...prev, [id]: prev[id].filter((o) => o !== name) }));
    if (selected[id].includes(name)) {
      onChange({ ...selected, [id]: selected[id].filter((o) => o !== name) });
    }
  };

  /** Global clear: every category. */
  const clearAll = () => onChange(emptySelection());

  return (
    <section dir="rtl" aria-label="סינון לפי סוג משרה">
      <div className="flex flex-row flex-wrap items-start gap-3">
        {CATEGORIES.map((category) => {
          const isOpen = open[category.id];
          const chosen = selected[category.id];
          const panelId = `filter-panel-${category.id}`;

          return (
            <div key={category.id} className="min-w-40 flex-1">
              <button
                type="button"
                onClick={() => toggleOpen(category.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-4 py-3 text-start font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  chosen.length > 0
                    ? "border-blue-500 bg-blue-50 text-blue-800"
                    : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  {category.title}
                  {chosen.length > 0 && (
                    <span className="rounded-full bg-blue-600 px-2 text-xs leading-5 text-white">
                      {chosen.length}
                    </span>
                  )}
                </span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {isOpen && (
                <div
                  id={panelId}
                  role="group"
                  aria-label={category.title}
                  className="mt-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex flex-wrap gap-2">
                    {[...category.options, ...custom[category.id]].map((option) => {
                      const checked = chosen.includes(option);
                      const isCustom = custom[category.id].includes(option);
                      return (
                        <span key={option} className="inline-flex items-center gap-1">
                          <label className="cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOption(category.id, option)}
                              className="peer sr-only focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="inline-block rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-sm text-gray-700 transition select-none hover:bg-gray-100 peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-checked:text-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500">
                              {option}
                            </span>
                          </label>
                          {isCustom && (
                            <button
                              type="button"
                              onClick={() => removeCustomOption(category.id, option)}
                              aria-label={`הסר את ${option}`}
                              title="הסר אפשרות"
                              className="rounded text-gray-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {/* Free text: creates a new option in this category and selects it */}
                  <div className="mt-3 flex flex-row gap-2">
                    <input
                      type="text"
                      value={drafts[category.id]}
                      maxLength={MAX_CUSTOM_LENGTH}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [category.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomOption(category.id);
                        }
                      }}
                      placeholder="הוסף אפשרות..."
                      aria-label={`הוסף אפשרות חדשה ל${category.title}`}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => addCustomOption(category.id)}
                      disabled={drafts[category.id].trim() === ""}
                      className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      הוסף
                    </button>
                  </div>

                  {/* Local clear: only this category */}
                  <div className="mt-3 border-t border-gray-100 pt-2">
                    <button
                      type="button"
                      onClick={() => clearCategory(category.id)}
                      disabled={chosen.length === 0}
                      className="rounded text-sm font-medium text-red-600 hover:underline focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                    >
                      נקה
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Global clear: every category */}
        <button
          type="button"
          onClick={clearAll}
          disabled={selectedTypes.length === 0}
          className="shrink-0 self-start rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          נקה את כל הסינונים
        </button>
      </div>

      {/* Summary of what will be searched */}
      {selectedTypes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>יתבצעו {selectedTypes.length} חיפושים נפרדים:</span>
          {CATEGORIES.flatMap((category) =>
            selected[category.id].map((type) => (
              <button
                key={`${category.id}-${type}`}
                type="button"
                onClick={() => toggleOption(category.id, type)}
                aria-label={`הסר את ${type} מהסינון`}
                title="הסר מהסינון"
                className="rounded-full bg-blue-100 px-3 py-1 text-blue-800 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {type} ×
              </button>
            ))
          )}
        </div>
      )}


    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  JobFilterSearch - standalone demo: search bar + filters + mock results   */
/* -------------------------------------------------------------------------- */

export default function JobFilterSearch() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Selection>(emptySelection);

  const [results, setResults] = useState<JobResult[] | null>(null);
  const [countsByType, setCountsByType] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  // Used to ignore the answer of an older search if a newer one was started.
  const latestSearchId = useRef(0);

  /** Flat list of every selected job type, across all categories. */
  const selectedTypes = useMemo(
    () => [...new Set(CATEGORIES.flatMap((category) => selected[category.id]))],
    [selected]
  );

  const canSearch = selectedTypes.length > 0 || query.trim() !== "";

  /* --------------------------------- search -------------------------------- */

  /**
   * Treats every selected job type as its own search query, runs all of them
   * in parallel with Promise.all, then aggregates (and de-duplicates) results.
   */
  const handleSearch = async () => {
    if (!canSearch) return;

    const searchId = ++latestSearchId.current;
    setLoading(true);

    // One query per selected job type; with no filters, a single free-text search.
    const queries: (string | null)[] = selectedTypes.length > 0 ? selectedTypes : [null];

    // One independent async search per query.
    const searches: Promise<{ type: string | null; jobs: Job[] }>[] = [];
    for (const type of queries) {
      searches.push(
        mockSearchJobs(type, query)
          .then((jobs) => ({ type, jobs }))
          // A failing search must not break the others.
          .catch((error) => {
            console.error(`Search failed for "${type ?? query}":`, error);
            return { type, jobs: [] as Job[] };
          })
      );
    }

    const responses = await Promise.all(searches);

    // A newer search started while this one was running - drop this answer.
    if (searchId !== latestSearchId.current) return;

    // Aggregate: the same job can be returned by several searches.
    const merged = new Map<number, JobResult>();
    const counts: Record<string, number> = {};

    for (const { type, jobs } of responses) {
      if (type !== null) counts[type] = jobs.length;

      for (const job of jobs) {
        const existing = merged.get(job.id);
        if (existing) {
          if (type !== null && !existing.matchedTypes.includes(type)) {
            existing.matchedTypes.push(type);
          }
        } else {
          merged.set(job.id, { ...job, matchedTypes: type !== null ? [type] : [] });
        }
      }
    }

    // Jobs found by more searches first.
    const aggregated = [...merged.values()].sort(
      (a, b) => b.matchedTypes.length - a.matchedTypes.length
    );

    setResults(aggregated);
    setCountsByType(counts);
    setLoading(false);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSearch();
  };

  /* ---------------------------------- view --------------------------------- */

  return (
    <section dir="rtl" className="mx-auto w-full max-w-4xl p-4 text-gray-800">
      {/* Main search bar */}
      <form onSubmit={onSubmit} className="flex flex-row gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש משרה או חברה..."
          aria-label="חיפוש משרה או חברה"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!canSearch || loading}
          className="shrink-0 rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "מחפש..." : "חיפוש"}
        </button>
      </form>

      {/* Filters: 4 independent dropdowns + global clear */}
      <div className="mt-4">
        <JobFilters selected={selected} onChange={setSelected} />
      </div>

      {/* Results */}
      <section className="mt-6" aria-live="polite" aria-label="תוצאות החיפוש">
        {loading && <p className="text-gray-500">מריץ חיפושים במקביל...</p>}

        {!loading && results !== null && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-lg font-bold text-black">
              נמצאו {results.length} משרות
            </h2>

            {Object.keys(countsByType).length > 0 && (
              <p className="mb-4 text-sm text-gray-500">
                {Object.entries(countsByType)
                  .map(([type, count]) => `${type}: ${count}`)
                  .join(" · ")}
              </p>
            )}

            {results.length === 0 ? (
              <p className="text-gray-500">לא נמצאו משרות מתאימות.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {results.map((job) => (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-semibold text-gray-900">{job.title}</p>
                      <p className="text-sm text-gray-500">
                        {job.company} · {job.location}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {job.matchedTypes.map((type) => (
                        <span
                          key={type}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
