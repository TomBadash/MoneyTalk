"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { openQuickAdd } from "@/components/quick-add";
import { NAV } from "@/components/nav-items";

function useActive() {
  const p = usePathname();
  return (href: string) => (href === "/" ? p === "/" : p === href || p.startsWith(href + "/"));
}

export function Sidebar({ unread, review }: { unread: number; review: number }) {
  const active = useActive();
  return (
    <aside className="sidebar" aria-label="ניווט ראשי">
      <Link href="/" className="logo" aria-label="MoneyTalk — דשבורד">
        <span className="mark">₪</span>
        <span className="word">Money<b>Talk</b></span>
      </Link>
      <button type="button" className="btn side-add" onClick={() => openQuickAdd()}>
        + הוספת הוצאה <kbd>N</kbd>
      </button>
      <nav>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? "active" : ""} aria-current={active(n.href) ? "page" : undefined}>
            <span className="gi" aria-hidden>{n.icon}</span>
            <span>{n.label}</span>
            {"soon" in n && n.soon && <small className="soon">בקרוב</small>}
            {n.href === "/transactions" && review > 0 && <small className="pill-n" aria-label={`${review} לאישור`}>{review}</small>}
          </Link>
        ))}
      </nav>
      <div className="side-foot">
        <Link href="/notifications" className="bell" aria-label={`התראות${unread ? `, ${unread} חדשות` : ""}`}>🔔{unread > 0 && <small className="pill-n">{unread}</small>}</Link>
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function BottomNav() {
  const active = useActive();
  const moreActive = ["/budgets", "/products", "/recurring", "/accounts", "/assistant", "/investments", "/settings", "/more", "/merchants", "/notifications", "/report", "/review"].some((h) => active(h));
  return (
    <nav className="bottomnav" aria-label="ניווט תחתון">
      <Link href="/" className={active("/") ? "active" : ""}><span className="gi" aria-hidden>⌂</span>בית</Link>
      <Link href="/transactions" className={active("/transactions") ? "active" : ""}><span className="gi" aria-hidden>🧾</span>תנועות</Link>
      <button type="button" className="add" aria-label="הוספת הוצאה" onClick={() => openQuickAdd()}>+</button>
      <Link href="/analytics" className={active("/analytics") ? "active" : ""}><span className="gi" aria-hidden>📊</span>ניתוח</Link>
      <Link href="/more" className={moreActive ? "active" : ""}><span className="gi" aria-hidden>☰</span>עוד</Link>
    </nav>
  );
}

export function MobileTopBar({ title, unread }: { title?: string; unread: number }) {
  return (
    <header className="appbar">
      {title ? <div className="ttl">{title}</div> : (
        <span className="logo"><span className="mark">₪</span><span className="word">Money<b>Talk</b></span></span>
      )}
      <div className="grow" />
      <Link href="/notifications" className="iconbtn" aria-label={`התראות${unread ? `, ${unread} חדשות` : ""}`}>🔔{unread > 0 && <small className="pill-n">{unread}</small>}</Link>
      <ThemeToggle />
    </header>
  );
}
