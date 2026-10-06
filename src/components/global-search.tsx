"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/** Always-available search: "/" focuses it, Enter opens the transactions view with the query applied. */
export function GlobalSearch() {
  const router = useRouter();
  const path = usePathname();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); ref.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-open-quick-add]")) window.dispatchEvent(new CustomEvent("mt:quickadd", { detail: "" }));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("click", onClick); };
  }, []);

  if (path.startsWith("/transactions")) return null; // the list has its own live search
  return (
    <form className="gsearch" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/transactions?q=${encodeURIComponent(q.trim())}`); }}>
      <span aria-hidden>🔍</span>
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: קפה, Wolt, מעל 500 שקל, מסעדות בספטמבר…" aria-label="חיפוש גלובלי" />
      <kbd aria-hidden>/</kbd>
    </form>
  );
}
