"use client";

import { useState } from "react";
import { onboardAction } from "@/app/account-actions";
import { parseMoney } from "@/lib/money-input";

const STEPS = [
  { name: "income", q: "כמה אתה מרוויח נטו בחודש?", hint: "הכנסה קבועה אחרי מסים. אפשר לעדכן אחר כך.", ph: "20,000" },
  { name: "rent", q: "כמה אתה משלם על שכר דירה?", hint: "בלי ארנונה וחשבונות — אותם נזהה לבד.", ph: "6,500" },
  { name: "savings", q: "כמה היית רוצה לחסוך או להשקיע כל חודש?", hint: "נשריין את זה לפני שנחשב כמה נשאר להוציא.", ph: "5,000" },
] as const;

export function OnboardingWizard() {
  const [i, setI] = useState(0);
  const [v, setV] = useState<Record<string, string>>({ income: "", rent: "", savings: "" });
  const last = i === STEPS.length;
  const cur = STEPS[i];
  const ok = !cur || (parseMoney(v[cur.name]) ?? -1) > 0;
  const income = parseMoney(v.income) ?? 0, rent = parseMoney(v.rent) ?? 0, sav = parseMoney(v.savings) ?? 0;
  const est = Math.max(0, income - rent - 130_000 - sav);
  return (
    <form action={onboardAction} className="stack-col onboard">
      <div className="steps" aria-label={`שלב ${Math.min(i + 1, 4)} מתוך 4`}>{[0, 1, 2, 3].map((k) => <i key={k} className={k <= i ? "on" : ""} />)}</div>
      {STEPS.map((s) => <input key={s.name} type="hidden" name={s.name} value={v[s.name]} />)}
      {!last ? (
        <>
          <h1 className="ttl">{cur.q}</h1>
          <p className="muted">{cur.hint}</p>
          <div className="with-cur"><input autoFocus className="input input-lg" inputMode="decimal" placeholder={cur.ph} value={v[cur.name]} aria-label={cur.q}
            onChange={(e) => setV({ ...v, [cur.name]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (ok) setI(i + 1); } }} /><span className="cur">₪</span></div>
          <div className="row"><button type="button" className="btn" disabled={!ok} onClick={() => setI(i + 1)}>המשך</button>{i > 0 && <button type="button" className="btn ghost" onClick={() => setI(i - 1)}>חזרה</button>}</div>
        </>
      ) : (
        <>
          <h1 className="ttl">מוכנים. נחבר את החשבונות?</h1>
          <div className="card"><div className="muted tiny">לפי מה שהזנת, ההערכה הראשונית שלנו להוצאות המשתנות החודש:</div>
            <div className="big-amt tnum">₪{Math.round(est / 100).toLocaleString("he-IL")}</div>
            <div className="muted tiny">הערכנו ₪1,300 לחשבונות קבועים נוספים (ארנונה, חשמל, סלולר…). כשנחבר חשבון נחליף את ההערכה בנתונים אמיתיים — בלי שתצטרך לבנות קטגוריות.</div></div>
          <button className="btn" name="connect" value="1">חבר בנק וכרטיסי אשראי</button>
          <button className="btn ghost" name="connect" value="0">דלג — אוסיף הוצאות ידנית</button>
        </>
      )}
    </form>
  );
}
