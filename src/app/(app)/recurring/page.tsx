import { getContext } from "@/lib/context";
import { detectRecurring, recurringAlerts, recurringForMonth } from "@/engine/recurring";
import { alertText } from "@/engine/insights-rules";
import { addMonths, monthStart } from "@/engine/period";
import { formatAgorot, formatIso } from "@/lib/format";
import { addRecurringAction, deleteRecurringAction } from "@/app/budget-actions";
import { installmentPlans } from "@/engine/installments";
import type { RecurringRule } from "@/domain/types";

export const metadata = { title: "הוצאות קבועות — MoneyTalk" };
const INTERVAL = { weekly: "שבועי", monthly: "חודשי", bimonthly: "דו-חודשי", quarterly: "רבעוני", yearly: "שנתי" } as const;

export default async function Recurring() {
  const ctx = await getContext();
  const ro = ctx.demo && !ctx.local;
  const [txns, user] = await Promise.all([ctx.read.txns({ from: addMonths(monthStart(ctx.today), -14), to: ctx.today }), ctx.read.recurring()]);
  const detected = detectRecurring(txns, ctx.today);
  const userRules = user.filter((r) => r.source === "user");
  const known = new Set(detected.map((d) => d.merchantNormalized));
  const all: RecurringRule[] = [...detected, ...userRules.filter((u) => !known.has(u.merchantNormalized))];
  const monthTxns = txns.filter((t) => t.date >= monthStart(ctx.today));
  const m = recurringForMonth(all.filter((r) => r.consumptionType !== "one_off"), monthTxns, ctx.today);
  const alerts = recurringAlerts(txns, detected, ctx.today).map(alertText).sort((a, b) => b.impact - a.impact);
  const plans = installmentPlans(txns).filter((p) => p.remaining > 0);
  const monthlyTotal = all.filter((r) => r.active && r.interval === "monthly").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="stack-col">
      <h1 className="ttl">הוצאות קבועות</h1>
      <section className="stats4" aria-label="סיכום החודש">
        <div className="stat"><div className="k">צפוי החודש</div><div className="v tnum">{formatAgorot(m.expected)}</div></div>
        <div className="stat"><div className="k">כבר שולם</div><div className="v tnum">{formatAgorot(m.paid)}</div></div>
        <div className="stat"><div className="k">עוד צפוי</div><div className="v tnum">{formatAgorot(m.remaining)}</div></div>
        <div className="stat"><div className="k">חודשיות פעילות</div><div className="v tnum">{formatAgorot(monthlyTotal)}</div></div>
      </section>

      {alerts.length > 0 && (
        <section aria-labelledby="al-h" className="alerts"><div className="section-h"><h2 id="al-h" className="h3">שווה לשים לב</h2></div>
          {alerts.map((a, i) => <div key={i} className={`insight-row ${a.tone}`}><i className="dotc" aria-hidden /><p dir="auto">{a.text}</p></div>)}
        </section>
      )}

      <section aria-labelledby="rl-h">
        <div className="section-h"><h2 id="rl-h" className="h3">זוהו אוטומטית</h2></div>
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead><tr><th>חיוב</th><th>תדירות</th><th>החיוב הבא</th><th className="n">סכום</th><th /></tr></thead>
            <tbody>
              {all.filter((r) => r.active).sort((a, b) => a.nextExpected.localeCompare(b.nextExpected)).map((r) => (
                <tr key={r.id}><td dir="auto">{r.title}{r.source === "user" && <small className="muted"> · הוגדר ידנית</small>}</td><td>{INTERVAL[r.interval]}</td><td className="tnum">{formatIso(r.nextExpected)}</td>
                  <td className="n tnum">{formatAgorot(r.amount, r.amount % 100 !== 0)}</td>
                  <td>{r.source === "user" && !ro && <form action={deleteRecurringAction}><input type="hidden" name="id" value={r.id} /><button className="tlink" aria-label={`מחיקת ${r.title}`}>הסר</button></form>}</td></tr>
              ))}
              {all.length === 0 && <tr><td colSpan={5} className="muted">עדיין לא זוהו חיובים חוזרים — נזהה אותם אוטומטית ככל שיצטברו נתונים.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {plans.length > 0 && (
        <section aria-labelledby="in-h"><div className="section-h"><h2 id="in-h" className="h3">עסקאות בתשלומים</h2></div>
          <div className="card list">{plans.map((p) => (
            <div key={p.merchant + p.monthly} className="uprow"><span className="grow" dir="auto">{p.merchant}<small className="muted"> · שולמו {p.paid} מתוך {p.paid + p.remaining}</small></span><span className="tnum muted">נותרו {formatAgorot(p.monthly * p.remaining)}</span><b className="tnum">{formatAgorot(p.monthly)}/חודש</b></div>
          ))}</div></section>
      )}

      <section aria-labelledby="add-h">
        <div className="section-h"><h2 id="add-h" className="h3">הוספת הוצאה קבועה ידנית</h2></div>
        <p className="muted tiny" style={{ margin: "-4px 4px 10px" }}>רק אם אין חיבור בנק — עם חיבור, ההוצאות הקבועות מזוהות לבד.</p>
        <form action={addRecurringAction} className="card inline-form">
          <div className="field"><label className="muted tiny" htmlFor="r-t">שם</label><input id="r-t" name="title" className="input" required placeholder="שכר דירה" disabled={ro} /></div>
          <div className="field"><label className="muted tiny" htmlFor="r-a">סכום (₪)</label><input id="r-a" name="amount" className="input" inputMode="decimal" required disabled={ro} style={{ width: 110 }} /></div>
          <div className="field"><label className="muted tiny" htmlFor="r-i">תדירות</label><select id="r-i" name="interval" className="select" disabled={ro}>{Object.entries(INTERVAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label className="muted tiny" htmlFor="r-d">יום בחודש</label><input id="r-d" name="day" type="number" min={1} max={28} defaultValue={1} className="input" disabled={ro} style={{ width: 80 }} /></div>
          <button className="btn" disabled={ro}>הוספה</button>
        </form>
      </section>
    </div>
  );
}
