import Link from "next/link";
import { getContext } from "@/lib/context";
import { buildMonthlyReport } from "@/services/report";
import { formatAgorot, formatPercent, formatSignedPercent, hebrewMonth } from "@/lib/format";
import { addMonths, monthKey } from "@/engine/period";
import { hrefFor } from "@/services/search";

export const metadata = { title: "דוח חודשי — MoneyTalk" };

export default async function Report({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const current = monthKey(ctx.today);
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) && sp.m <= current ? sp.m : monthKey(addMonths(`${current}-01`, -1));
  const all = await ctx.read.txns();
  const r = buildMonthlyReport(all, month);
  const prev = monthKey(addMonths(`${month}-01`, -1)), next = monthKey(addMonths(`${month}-01`, 1));
  const [y, m] = month.split("-").map(Number);
  const range = { from: `${month}-01`, to: `${month}-31` };

  return (
    <div className="stack-col">
      <h1 className="ttl">דוח חודשי</h1>
      <div className="month-nav">
        <Link href={`/report?m=${prev}`} aria-label="חודש קודם" className="navbtn">›</Link>
        <div className="lbl"><div className="m">{hebrewMonth(m - 1)} {y}</div></div>
        {next <= current ? <Link href={`/report?m=${next}`} aria-label="חודש הבא" className="navbtn">‹</Link> : <span className="navbtn dis" aria-hidden>‹</span>}
      </div>
      {!r.hasData ? <div className="empty"><div className="em">📅</div><div className="t">אין נתונים לחודש הזה</div></div> : (<>
        <section className="card">
          <div className="muted tiny">סך ההוצאות</div>
          <div className="row" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
            <div className="big-amt tnum">{formatAgorot(r.total)}</div>
            {r.change != null && <span className={`status ${r.change > 0.1 ? "warn" : "good"}`}>{formatSignedPercent(r.change)} לעומת {hebrewMonth(Number(r.prevMonth.slice(5)) - 1)}</span>}
          </div>
        </section>
        <section className="stats4">
          <div className="stat"><div className="k">קבועות</div><div className="v tnum">{formatAgorot(r.fixed)}</div></div>
          <div className="stat"><div className="k">משתנות</div><div className="v tnum">{formatAgorot(r.variable)}</div></div>
          <div className="stat"><div className="k">חיסכון</div><div className={`v tnum ${r.saved < 0 ? "warn" : "pos"}`}>{formatAgorot(r.saved)}</div></div>
          <div className="stat"><div className="k">שיעור חיסכון</div><div className="v tnum">{r.savingsRate == null ? "—" : formatPercent(r.savingsRate)}</div>{r.invested > 0 && <div className="sub muted">הושקע/נחסך בנפרד {formatAgorot(r.invested)}</div>}</div>
        </section>
        <section className="card list">
          {r.largestCategory && <div className="uprow"><span className="grow">הקטגוריה הגדולה</span><Link className="lnk" href={`/analytics?range=custom&from=${range.from}&to=${range.to}&cat=${r.largestCategory.id}`}>{r.largestCategory.name} · {formatAgorot(r.largestCategory.amount)}</Link></div>}
          {r.biggestIncrease && <div className="uprow"><span className="grow">העלייה הגדולה ביותר</span><Link className="lnk" href={hrefFor({ ...range, categoryId: r.biggestIncrease.id })}>{r.biggestIncrease.name} +{formatAgorot(r.biggestIncrease.delta)}{r.biggestIncrease.pct != null ? ` (${formatSignedPercent(r.biggestIncrease.pct)})` : ""}</Link></div>}
          <div className="uprow"><span className="grow">ממוצע שבועי</span><b className="tnum">{formatAgorot(r.weeklyAvg)}</b></div>
        </section>
        {r.insights.length > 0 && <section><div className="section-h"><h2 className="h3">תובנות החודש</h2></div><div className="insights">{r.insights.map((t, i) => <div key={i} className="insight-row neutral"><i className="dotc" aria-hidden /><p dir="auto">{t}</p></div>)}</div></section>}
      </>)}
    </div>
  );
}
