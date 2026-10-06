import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { getDashboard } from "@/services/dashboard";
import { PaceChart } from "@/components/pace-chart";
import { formatAgorot, formatIsoShort, formatPercent, hebrewMonth } from "@/lib/format";

export const metadata = { title: "MoneyTalk — דשבורד" };

function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false }).format(now));
  return h < 5 ? "לילה טוב" : h < 12 ? "בוקר טוב" : h < 18 ? "צהריים טובים" : "ערב טוב";
}
const CONF = { high: "ביטחון גבוה", medium: "ביטחון בינוני", low: "ביטחון נמוך" } as const;

export default async function Dashboard() {
  const ctx = await getContext();
  if (!ctx.onboarded && !ctx.local) redirect("/onboarding");
  const d = await getDashboard(ctx.read, ctx.today, ctx.demo);
  const over = d.remainingMonth < 0;
  const [y, m] = d.monthKey.split("-").map(Number);
  const paceLabel = d.pace.status === "over" ? "מעל הקצב" : d.pace.status === "under" ? "מתחת לקצב — יש מרווח" : "בקצב היעד";
  const overBy = d.pace.spentToDate - d.pace.idealToDate;
  const strongOver = d.pace.status === "over" && overBy > d.monthTarget * 0.2;
  const maxCat = Math.max(1, ...d.categories.map((c) => c.amount));

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <div className="greeting">{greeting()}{ctx.displayName ? `, ${ctx.displayName}` : ""}</div>
          <h1 className="ttl">{hebrewMonth(m - 1)} {y}</h1>
        </div>
      </div>

      <section className="hero" aria-labelledby="hero-l">
        <div className="label" id="hero-l">נשאר לך להוציא החודש</div>
        <div className={`amount tnum ${over ? "warn" : ""}`}>{formatAgorot(d.remainingMonth)}</div>
        <div className="hero-sub">
          {over ? `חרגת מהיעד ב-${formatAgorot(-d.remainingMonth)}` : `מתוך יעד של ${formatAgorot(d.monthTarget)}`}
          {" · "}נותרו {d.daysLeft} ימים{d.targetDerived ? " · יעד מחושב אוטומטית" : ""}
        </div>
      </section>

      <section className="stats4" aria-label="מדדים עיקריים">
        <div className="stat"><div className="k">נשאר השבוע</div><div className={`v tnum ${d.remainingWeek < 0 ? "warn" : ""}`}>{formatAgorot(d.remainingWeek)}</div>
          <div className="sub muted">{d.remainingWeek >= 0 ? `היום: ${formatAgorot(d.todayAllowance)}` : "חריגה — מתאזן בהמשך"}</div></div>
        <div className="stat"><div className="k">הוצאות עד כה</div><div className="v tnum">{formatAgorot(d.spentMonth)}</div>
          <div className="sub muted">מזה משתנות {formatAgorot(d.spentVariable)}</div></div>
        <div className="stat"><div className="k">חיסכון צפוי</div><div className={`v tnum ${d.forecast.savings < 0 ? "warn" : "pos"}`}>{formatAgorot(d.forecast.savings)}</div>
          <div className="sub muted">{CONF[d.forecast.confidence]}</div></div>
        <div className="stat"><div className="k">שיעור חיסכון</div><div className={`v tnum ${d.forecast.savingsRate < 0 ? "warn" : ""}`}>{formatPercent(d.forecast.savingsRate)}</div>
          <div className="sub muted">צפי לסוף החודש</div></div>
      </section>

      <section className="card pace-card" aria-labelledby="pace-h">
        <div className="spread">
          <h2 id="pace-h" className="h3">קצב הוצאות מול יעד</h2>
          <span className={`status ${d.pace.status === "over" ? (strongOver ? "bad" : "warn") : "good"}`}>{paceLabel}</span>
        </div>
        <PaceChart pace={d.pace} monthTarget={d.monthTarget} />
        <div className="legend-inline"><span><i className={`ln actual ${d.pace.status === "over" ? "over" : ""}`} />בפועל {formatAgorot(d.pace.spentToDate)}</span><span><i className="ln ideal" />קצב יעד {formatAgorot(d.pace.idealToDate)}</span></div>
        {d.forecast.variance !== 0 && <p className="muted tiny">צפי לסוף החודש: הוצאות משתנות {formatAgorot(d.forecast.variableSpending)} ({d.forecast.variance > 0 ? "+" : "-"}{formatAgorot(Math.abs(d.forecast.variance))} {d.forecast.variance > 0 ? "מעל" : "מתחת ל"}יעד)</p>}
      </section>

      <div className="two-col">
        {d.categories.length > 0 && (
          <section aria-labelledby="cat-h">
            <div className="section-h"><h2 id="cat-h" className="h3">לאן הולך הכסף</h2><Link href="/analytics">ניתוח מלא</Link></div>
            <div className="card list">
              {d.categories.map((c) => {
                const pct = c.budget ? c.amount / c.budget : null;
                const tone = pct == null ? "" : pct > 1 ? "over" : pct >= 0.8 ? "warn" : "";
                return (
                  <Link key={c.id} href={`/analytics?cat=${c.id}`} className="catrow">
                    <span className="sw" style={{ background: c.color }} aria-hidden />
                    <div className="grow">
                      <div className="spread"><span>{c.name}</span><b className="tnum">{formatAgorot(c.amount)}</b></div>
                      <div className={`progress thin ${tone}`}><span style={{ width: `${Math.min(100, (pct != null ? pct : c.amount / maxCat) * 100)}%`, background: pct == null ? c.color : undefined }} /></div>
                      {c.budget && <div className="tiny muted">{formatPercent(c.amount / c.budget)} מתקציב {formatAgorot(c.budget)}</div>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section aria-labelledby="up-h">
          <div className="section-h"><h2 id="up-h" className="h3">חיובים קרובים</h2><Link href="/recurring">כל הקבועות</Link></div>
          <div className="card list">
            {d.upcoming.length === 0 && <div className="muted tiny">אין חיובים צפויים עד סוף החודש.</div>}
            {d.upcoming.map((u, i) => (
              <div key={i} className="uprow">
                <span className="date tnum">{formatIsoShort(u.date)}</span>
                <span className="grow" dir="auto">{u.title}{u.kind === "installment" && <small className="muted"> · תשלום</small>}</span>
                <b className="tnum">{formatAgorot(u.amount)}</b>
              </div>
            ))}
          </div>
        </section>
      </div>

      {d.insights.length > 0 && (
        <section aria-labelledby="ins-h">
          <div className="section-h"><h2 id="ins-h" className="h3">תובנות</h2></div>
          <div className="insights">
            {d.insights.map((i) => (
              <div key={i.id} className={`insight-row ${i.tone}`}>
                <i className="dotc" aria-hidden />
                <p dir="auto">{i.text}</p>
                {i.link && <Link href={i.link} aria-label="הצג פרטים">‹</Link>}
              </div>
            ))}
          </div>
        </section>
      )}

      {d.reviewCount > 0 && (
        <Link href="/review" className="review-banner">
          <b>{d.reviewCount}</b> עסקאות מחכות לאישור מהיר — לוקח כמה שניות
          <span aria-hidden>‹</span>
        </Link>
      )}
    </div>
  );
}
