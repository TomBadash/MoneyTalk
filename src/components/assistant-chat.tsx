"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { askAction } from "@/app/actions";
import type { Answer } from "@/services/assistant";
import { hrefFor } from "@/services/search";

type Msg = { q: string; a: Answer };
const EXAMPLES = ["כמה הוצאתי על קפה מתחילת השנה?", "כמה כסף נשאר לי להוציא השבוע?", "מה המוצרים שאני קונה הכי הרבה?", "כמה הוצאתי ב-Wolt?", "מה שלוש הקטגוריות שעלו הכי הרבה?", "איזה מנויים התייקרו?", "כמה אני צפוי לחסוך החודש?", "מה ההוצאות הקבועות שלי?"];

export function AssistantChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const ask = (q: string) => {
    if (!q.trim() || pending) return;
    setText("");
    start(async () => { const a = await askAction(q); setMsgs((m) => [...m, { q, a }]); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 30); });
  };
  return (
    <div className="chat">
      {msgs.length === 0 && (
        <div className="chips" role="group" aria-label="שאלות לדוגמה">{EXAMPLES.map((e) => <button key={e} type="button" className="chip" onClick={() => ask(e)}>{e}</button>)}</div>
      )}
      <div className="msgs" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className="turn">
            <div className="bubble q" dir="auto">{m.q}</div>
            <div className={`bubble a ${m.a.ok ? "" : "no"}`}>
              <p>{m.a.text}</p>
              {m.a.rows && m.a.rows.length > 0 && <ul className="arows">{m.a.rows.map((r, k) => <li key={k}><span dir="auto">{r.label}</span><b className="tnum">{r.value}</b>{r.sub && <small className="muted">{r.sub}</small>}</li>)}</ul>}
              {m.a.query && <Link className="sort" href={hrefFor(m.a.query)}>הצג תנועות</Link>}
            </div>
          </div>
        ))}
        {pending && <div className="bubble a muted">בודק בנתונים שלך…</div>}
        <div ref={end} />
      </div>
      <form className="quick chat-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="שאל על ההוצאות שלך…" aria-label="שאלה לעוזר" maxLength={300} autoComplete="off" />
        <button className="go" type="submit" disabled={pending || !text.trim()} aria-label="שליחה">↵</button>
      </form>
      <p className="muted tiny">המספרים מחושבים מהעסקאות שלך בלבד — לא מנוחשים. כל תשובה כוללת קישור לעסקאות שמאחוריה.</p>
    </div>
  );
}
