"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveAction, correctAction } from "@/app/actions";
import { subcategoryGroups } from "@/classify/taxonomy";
import { formatAgorot } from "@/lib/format";

export type ReviewItem = { id: string; title: string; amount: number; date: string; path: string; confidence: number; reason: string; subcategoryId: string; icon: string; color: string };
const groups = subcategoryGroups();

/** One card at a time. Enter = approve, E = change category, → / S = skip. Clears in seconds. */
export function ReviewQueue({ items, readOnly }: { items: ReviewItem[]; readOnly: boolean }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState(0);
  const [, start] = useTransition();
  const cur = items[i];

  const next = () => { setEditing(false); setI((x) => x + 1); };
  const approve = () => { if (!cur || readOnly) return; const id = cur.id; setDone((d) => d + 1); next(); start(async () => { await approveAction(id); }); };
  const change = (sub: string) => { if (!cur || readOnly) return; const id = cur.id; setDone((d) => d + 1); next(); start(async () => { await correctAction(id, sub); }); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "SELECT") return;
      if (e.key === "Enter") { e.preventDefault(); approve(); }
      else if (e.key === "e" || e.key === "E" || e.key === "ק") setEditing(true);
      else if (e.key === "ArrowLeft" || e.key === "s" || e.key === "S") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => { if (!cur && done > 0) router.refresh(); }, [cur, done, router]);

  if (!cur) return (
    <div className="empty"><div className="em">🎉</div><div className="t">{items.length ? "סיימת! הכול מסווג." : "אין מה לאשר"}</div><div className="s">נזכור את כל מה שאישרת — לא נשאל שוב.</div></div>
  );
  return (
    <div>
      <p className="muted tiny" aria-live="polite">{i + 1} מתוך {items.length}</p>
      <div className="card review-card">
        <div className="row"><span className="ic big" style={{ background: cur.color }} aria-hidden>{cur.icon}</span>
          <div className="grow"><div className="t" dir="auto" style={{ fontWeight: 800, fontSize: 18 }}>{cur.title}</div><div className="muted tiny">{cur.date}</div></div>
          <b className="tnum" style={{ fontSize: 22 }}>{formatAgorot(cur.amount, cur.amount % 100 !== 0)}</b></div>
        <p style={{ marginTop: 14 }}>נראה לנו: <b>{cur.path}</b> <span className="muted tiny">({Math.round(cur.confidence * 100)}%)</span></p>
        <p className="muted tiny">{cur.reason}</p>
        {editing && (
          <select className="select" autoFocus aria-label="בחירת קטגוריה" defaultValue={cur.subcategoryId} onChange={(e) => change(e.target.value)}>
            {groups.map((g) => <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={o.id} value={o.id}>{o.he}</option>)}</optgroup>)}
          </select>
        )}
        <div className="review-actions">
          <button type="button" className="btn" onClick={approve} disabled={readOnly}>✓ נכון <kbd>Enter</kbd></button>
          <button type="button" className="btn ghost" onClick={() => setEditing((e) => !e)} disabled={readOnly}>שינוי <kbd>E</kbd></button>
          <button type="button" className="btn ghost" onClick={next}>דלג <kbd>S</kbd></button>
        </div>
        {readOnly && <p className="muted tiny">נתוני דוגמה — אישור זמין עם נתונים אמיתיים.</p>}
      </div>
    </div>
  );
}
