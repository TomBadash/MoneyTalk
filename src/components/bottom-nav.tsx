"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="bottomnav" aria-label="ניווט ראשי">
      <Link href="/" className={isActive("/") ? "active" : ""}>
        <span className="gi">⌂</span> בית
      </Link>
      <Link
        href="/expenses"
        className={isActive("/expenses") ? "active" : ""}
      >
        <span className="gi">🧾</span> הוצאות
      </Link>
      <Link href="/expenses/new" className="add" aria-label="הוספת הוצאה">
        +
      </Link>
      <Link href="/reports" className={isActive("/reports") ? "active" : ""}>
        <span className="gi">📊</span> דוחות
      </Link>
      <Link href="/settings" className={isActive("/settings") ? "active" : ""}>
        <span className="gi">⚙︎</span> הגדרות
      </Link>
    </nav>
  );
}
