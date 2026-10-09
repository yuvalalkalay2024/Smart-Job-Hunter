import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white px-4 py-4 text-center text-sm text-gray-500">
      <nav className="flex items-center justify-center gap-6">
        <Link href="/privacy" className="rounded hover:text-gray-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500">
          מדיניות פרטיות
        </Link>
        <Link href="/terms" className="rounded hover:text-gray-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500">
          תנאי שימוש
        </Link>
      </nav>
    </footer>
  );
}
