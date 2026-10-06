"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Live search box: updates the URL (debounced) so results stream in server-side — shareable and back-button friendly. */
export function TxnSearch({ placeholder = "חיפוש: קפה, Wolt, מעל 500 שקל, מסעדות בספטמבר…" }: { placeholder?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [v, setV] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && t && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const push = (value: string) => {
    const p = new URLSearchParams(sp.toString());
    if (value.trim()) p.set("q", value.trim()); else p.delete("q");
    p.delete("limit");
    start(() => router.replace(`${path}?${p.toString()}`, { scroll: false }));
  };
  return (
    <div className="search" role="search" aria-busy={pending}>
      <span aria-hidden>🔍</span>
      <input ref={ref} value={v} placeholder={placeholder} aria-label="חיפוש תנועות" autoComplete="off"
        onChange={(e) => { setV(e.target.value); clearTimeout(timer.current); timer.current = setTimeout(() => push(e.target.value), 140); }} />
      {v && <button type="button" className="clear" aria-label="נקה חיפוש" onClick={() => { setV(""); push(""); }}>✕</button>}
    </div>
  );
}
