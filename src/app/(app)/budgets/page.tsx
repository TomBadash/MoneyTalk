import { getContext } from "@/lib/context";
import { getDashboard } from "@/services/dashboard";
import { computeBudgetSuggestions, ensureSuggestions, suggestionPeriod } from "@/services/suggestions";
import { setBudgetAction, removeBudgetAction, resolveSuggestionAction, saveGoalAction, deleteGoalAction } from "@/app/budget-actions";
import { goalProgress } from "@/engine/goals";
import { nodeInfo, CATS } from "@/classify/taxonomy";
import { formatAgorot, formatIso, formatPercent } from "@/lib/format";
import { isVariable } from "@/engine/consumption";
import { monthStart } from "@/engine/period";

export const metadata = { title: "תקציבים — MoneyTalk" };
const GOAL_KIND = { monthly_saving: "חיסכון חודשי", emergency_fund: "קרן חירום", vacation: "חופשה", purchase: "רכישה", investment: "השקעה" } as const;
const sh = (a: number) => String(Math.round(a / 100));

export default async function Budgets() {
  const ctx = await getContext();
  const ro = ctx.demo && !ctx.local;
  if (!ctx.demo) await ensureSuggestions(ctx.write, ctx.today).catch(() => undefined);
  const [d, budgets, goals, txns] = await Promise.all([
    getDashboard(ctx.read, ctx.today, ctx.demo), ctx.read.budgets(), ctx.read.goals(), ctx.read.txns({ from: monthStart(ctx.today), to: ctx.today }),
  ]);
  const persisted = ctx.demo ? [] : await ctx.read.suggestions("pending");
  const sugg = ctx.demo
    ? (await computeBudgetSuggestions(ctx.read, ctx.today)).map((s, i) => ({ id: `demo-${i}`, categoryId: s.categoryId, payload: { current: s.current, suggested: s.suggested, avg: s.avg, months: s.months } as Record<string, number | null> }))
    : persisted.map((s) => ({ id: s.id, categoryId: s.categoryId ?? null, payload: s.payload as Record<string, number | null> }));

  const spentBy = new Map<string, number>();
  for (const t of txns) if (isVariable(t) && t.categoryId) spentBy.set(t.categoryId, (spentBy.get(t.categoryId) ?? 0) + t.amount);
  const catBudgets = budgets.filter((b) => b.categoryId);
  const free = CATS.filter((c) => c.consumption && !catBudgets.some((b) => b.categoryId === c.id) && ["c_eating_out", "c_groceries", "c_delivery", "c_shopping", "c_entertainment", "c_fuel", "c_bars"].includes(c.id));
  const period = suggestionPeriod(ctx.today);

  return (
    <div className="stack-col">
      <h1 className="ttl">תקציבים ויעדים</h1>

      <section className="card">
        <h2 className="h3">יעד הוצאות משתנות לחודש</h2>
        <div className="big-amt tnum" style={{ marginTop: 8 }}>{formatAgorot(d.monthTarget)}</div>
        <p className="muted tiny">{d.targetDerived ? "מחושב אוטומטית: הכנסה − הוצאות קבועות − חיסכון − השקעות. אפשר לקבוע יעד משלך." : "יעד שקבעת. נציע שיפורים לפי ההתנהגות שלך — אבל לעולם לא נשנה בלי אישור."}</p>
        <form action={setBudgetAction} className="inline-form" style={{ marginTop: 12 }}>
          <input type="hidden" name="categoryId" value="" />
          <div className="field"><label htmlFor="b-all" className="muted tiny">יעד חדש (₪)</label><input id="b-all" name="amount" className="input" inputMode="decimal" required defaultValue={sh(d.monthTarget)} disabled={ro} /></div>
          <button className="btn" disabled={ro}>שמירה</button>
        </form>
      </section>

      {sugg.length > 0 && (
        <section aria-labelledby="sg-h" className="stack-col">
          <h2 id="sg-h" className="h3">המלצות ליעד של {period.slice(5)}/{period.slice(0, 4)}</h2>
          {sugg.map((s) => {
            const p = s.payload; const name = s.categoryId ? nodeInfo(s.categoryId).he : "הוצאות משתנות (סה״כ)";
            return (
              <div key={s.id} className="sugg">
                <p>ב-{p.months} החודשים האחרונים הוצאת בממוצע <b>{formatAgorot(p.avg ?? 0)}</b> בחודש על {name}.{p.current != null && <> היעד הנוכחי שלך הוא <b>{formatAgorot(p.current)}</b>.</>} <br />יעד מומלץ: <b>{formatAgorot(p.suggested ?? 0)}</b></p>
                <form action={resolveSuggestionAction} className="acts">
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn" name="decision" value="approve" disabled={ro}>אישור</button>
                  <input className="input" name="amount" inputMode="decimal" placeholder="סכום אחר" aria-label="סכום אחר" disabled={ro} />
                  <button className="btn ghost" name="decision" value="modify" disabled={ro}>עדכון</button>
                  <button className="btn ghost" name="decision" value="ignore" disabled={ro}>התעלם</button>
                </form>
              </div>
            );
          })}
        </section>
      )}

      <section aria-labelledby="cb-h">
        <div className="section-h"><h2 id="cb-h" className="h3">תקציבי קטגוריות (אופציונלי)</h2></div>
        <div className="card list">
          {catBudgets.length === 0 && <p className="muted tiny">אין תקציבי קטגוריה. אפשר להתחיל בלי — היעד הכללי מספיק.</p>}
          {catBudgets.map((b) => {
            const spent = spentBy.get(b.categoryId!) ?? 0; const pct = spent / b.amount;
            return (
              <div key={b.categoryId} className="catrow">
                <div className="grow">
                  <div className="spread"><span>{nodeInfo(b.categoryId).he}</span><span className="tnum"><b>{formatAgorot(spent)}</b> / {formatAgorot(b.amount)}</span></div>
                  <div className={`progress thin ${pct > 1 ? "over" : pct >= 0.8 ? "warn" : ""}`}><span style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
                  <div className="tiny muted">{formatPercent(pct)} · {pct > 1 ? `חריגה של ${formatAgorot(spent - b.amount)}` : `נותרו ${formatAgorot(b.amount - spent)}`}</div>
                  <form action={setBudgetAction} className="inline-form" style={{ marginTop: 8 }}>
                    <input type="hidden" name="categoryId" value={b.categoryId!} />
                    <input name="amount" className="input" inputMode="decimal" defaultValue={sh(b.amount)} aria-label={`תקציב ${nodeInfo(b.categoryId).he}`} disabled={ro} style={{ width: 110 }} />
                    <button className="btn ghost" disabled={ro}>עדכון</button>
                    <button className="btn ghost" formAction={removeBudgetAction} disabled={ro}>הסרה</button>
                  </form>
                </div>
              </div>
            );
          })}
          {free.length > 0 && (
            <form action={setBudgetAction} className="inline-form" style={{ marginTop: 12 }}>
              <div className="field"><label htmlFor="nb-c" className="muted tiny">הוספת תקציב</label>
                <select id="nb-c" name="categoryId" className="select" disabled={ro}>{free.map((c) => <option key={c.id} value={c.id}>{c.he}</option>)}</select></div>
              <div className="field"><label htmlFor="nb-a" className="muted tiny">סכום חודשי (₪)</label><input id="nb-a" name="amount" className="input" inputMode="decimal" required disabled={ro} style={{ width: 110 }} /></div>
              <button className="btn ghost" disabled={ro}>הוספה</button>
            </form>
          )}
        </div>
      </section>

      <section aria-labelledby="g-h">
        <div className="section-h"><h2 id="g-h" className="h3">יעדי חיסכון</h2></div>
        <p className="muted tiny" style={{ margin: "-4px 4px 10px" }}>יעדי חיסכון נפרדים מהוצאות — הם לא נספרים כצריכה.</p>
        <div className="stack-col">
          {goals.map((g) => {
            const p = goalProgress(g, ctx.today);
            return (
              <div key={g.id} className="card">
                <div className="spread"><b>{g.name}</b><span className="muted tiny">{GOAL_KIND[g.kind]}</span></div>
                <div className="progress" style={{ margin: "10px 0" }}><span style={{ width: `${p.pct * 100}%` }} /></div>
                <div className="spread tiny"><span className="tnum">{formatAgorot(g.current)} מתוך {formatAgorot(g.target)}</span><span>{formatPercent(p.pct)}</span></div>
                <p className="muted tiny">{p.done ? "הושג! 🎉" : [p.requiredMonthly != null ? `נדרש ${formatAgorot(p.requiredMonthly)} בחודש עד ${formatIso(g.targetDate!)}` : null, p.eta ? `בקצב הנוכחי: ${formatIso(p.eta)}` : null].filter(Boolean).join(" · ") || "הוסף הפקדה חודשית או תאריך יעד כדי לראות הערכת סיום."}</p>
                <form action={saveGoalAction} className="inline-form">
                  <input type="hidden" name="id" value={g.id} /><input type="hidden" name="name" value={g.name} /><input type="hidden" name="kind" value={g.kind} /><input type="hidden" name="target" value={sh(g.target)} />
                  <input type="hidden" name="monthly" value={g.monthlyContribution ? sh(g.monthlyContribution) : ""} /><input type="hidden" name="date" value={g.targetDate ?? ""} />
                  <div className="field"><label className="muted tiny" htmlFor={`cur-${g.id}`}>נצבר עד כה (₪)</label><input id={`cur-${g.id}`} name="current" className="input" inputMode="decimal" defaultValue={sh(g.current)} disabled={ro} style={{ width: 120 }} /></div>
                  <button className="btn ghost" disabled={ro}>עדכון</button>
                  <button className="btn ghost" formAction={deleteGoalAction} disabled={ro}>מחיקה</button>
                </form>
              </div>
            );
          })}
          <form action={saveGoalAction} className="card inline-form">
            <div className="field"><label className="muted tiny" htmlFor="g-n">שם היעד</label><input id="g-n" name="name" className="input" required placeholder="קרן חירום" disabled={ro} /></div>
            <div className="field"><label className="muted tiny" htmlFor="g-k">סוג</label><select id="g-k" name="kind" className="select" disabled={ro}>{Object.entries(GOAL_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label className="muted tiny" htmlFor="g-t">סכום יעד (₪)</label><input id="g-t" name="target" className="input" inputMode="decimal" required disabled={ro} style={{ width: 110 }} /></div>
            <div className="field"><label className="muted tiny" htmlFor="g-m">הפקדה חודשית (₪)</label><input id="g-m" name="monthly" className="input" inputMode="decimal" disabled={ro} style={{ width: 110 }} /></div>
            <div className="field"><label className="muted tiny" htmlFor="g-d">עד תאריך</label><input id="g-d" name="date" type="date" className="input" disabled={ro} /></div>
            <button className="btn" disabled={ro}>הוספת יעד</button>
          </form>
        </div>
      </section>
      {ro && <p className="muted tiny">אלו נתוני דוגמה — עריכה זמינה לאחר הוספת נתונים אמיתיים.</p>}
    </div>
  );
}
