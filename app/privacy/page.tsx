import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מדיניות פרטיות | Smart Hunter",
};

export default function PrivacyPage() {
  return (
    <main dir="rtl" className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 text-gray-800">
      <h1 className="mb-6 text-3xl font-bold text-gray-900">מדיניות פרטיות</h1>
      <section className="space-y-4 leading-7">
        <p>
          Mitzi Jobs משתמש בהתחברות Google (OAuth) אך ורק כדי לוודא שמי שנכנס
          למערכת הוא משתמש אמיתי. אנחנו לא שומרים פרטים אישיים במסד נתונים.
        </p>
        <p>
          פרטי הסשן נשמרים באופן זמני בטוקן (JWT) בדפדפן, ונמחקים כשיוצאים מהמערכת
          או כשהסשן פג. אין לנו פרופיל משתמש שנשמר בשרת.
        </p>
        <p>
          קובץ הקשרים מלינקדאין, אם מעלים אותו, נשלח רק לצורך החיפוש הנוכחי ולא
          נשמר אצלנו.
        </p>
      </section>
    </main>
  );
}
