"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { BottomNav } from "@/components/bottom-nav";

/** Mobile-first centered column with a sticky top bar and a fixed bottom nav.
 *  `title` renders on the left of the bar; if omitted, the logo shows. */
export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="shell">
      <header className="appbar">
        {title ? (
          <div>
            <div className="ttl">{title}</div>
            {subtitle && <div className="greeting">{subtitle}</div>}
          </div>
        ) : (
          <span className="logo">
            <span className="mark">₪</span>
            <span className="word">
              Money<b>Talk</b>
            </span>
          </span>
        )}
        <div className="grow" />
        <ThemeToggle />
      </header>

      <main className="content">{children}</main>

      <BottomNav />
    </div>
  );
}
