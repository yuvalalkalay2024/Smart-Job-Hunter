import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "תנאי שימוש | Smart Hunter",
};

export default function TermsPage() {
  return (
    <main dir="rtl" className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 text-gray-800">
      <h1 className="mb-6 text-3xl font-bold text-gray-900">תנאי שימוש</h1>
      <section className="space-y-4 leading-7">
        <p>
          Mitzi Jobs הוא כלי אוטומטי לאיסוף מודעות דרושים ממקורות חיצוניים.
          אנחנו לא בודקים את המשרות, לא מאמתים אותן, ולא אחראים לתוכן שלהן.
        </p>
        <p>
          המודעות מגיעות מאתרים של צד שלישי ועשויות להיות לא מעודכנות, סגורות,
          או לא מדויקות. הגשת מועמדות נעשית על אחריות המשתמש בלבד, ישירות מול
          המעסיק.
        </p>
        <p>
          השימוש באפליקציה מהווה הסכמה לכך שהתוצאות הן מידע כללי בלבד, ולא
          המלצה או התחייבות לתעסוקה.
        </p>
      </section>
    </main>
  );
}
