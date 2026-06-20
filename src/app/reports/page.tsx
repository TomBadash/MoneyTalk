"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { getCategory } from "@/lib/categories";
import { formatMoney, formatPercent, hebrewMonth } from "@/lib/format";
import {
  monthTotal,
  categoryBreakdown,
  dailyAverage,
  monthCount,
  biggestInMonth,
  recurringSplit,
  monthlyTotals,
  isCurrentMonth,
  pctChange,
} from "@/lib/selectors";

function trendChip(change: number | null) {
  if (change == null) return null;
  const pct = Math.round(Math.abs(change) * 100);
  if (pct === 0) return <span className="trend flat">ללא שינוי</span>;
  const up = change > 0;
  return (
    <span className={`trend ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {pct}%
    </span>
  );
}

export default function ReportsPage() {
  const { expenses, loaded, monthlyBudget } = useStore();
  // 0 = current month, 1 = previous month, …
  const [offset, setOffset] = useState(0);

  const now = new Date();
  const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const current = isCurrentMonth(monthDate);
  // Reference point inside the month: "now" for the live month, otherwise the
  // last day (so day-count math uses the full month).
  const ref = current
    ? now
    : new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59);

  const total = monthTotal(expenses, ref);
  const prevRef = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 15);
  const prevTotal = monthTotal(expenses, prevRef);
  const change = pctChange(total, prevTotal);

  const slices = categoryBreakdown(expenses, ref).slice(0, 6);
  const avg = dailyAverage(expenses, ref);
  const count = monthCount(expenses, ref);
  const biggest = biggestInMonth(expenses, ref);
  const { recurring, oneTime } = recurringSplit(expenses, ref);
  const recurringRatio = total > 0 ? recurring / total : 0;

  const usedRatio = monthlyBudget > 0 ? total / monthlyBudget : 0;
  const overBudget = total > monthlyBudget;

  const trail = monthlyTotals(expenses, ref, 6);
  const trailMax = Math.max(1, ...trail.map((t) => t.total));

  // donut gradient
  let acc = 0;
  const stops = slices
    .map((s) => {
      const from = acc * 100;
      acc += s.ratio;
      return `${s.category.color} ${from}% ${acc * 100}%`;
    })
    .join(", ");
  const donutBg = slices.length > 0 ? `conic-gradient(${stops})` : "var(--surface-2)";

  return (
    <AppShell title="דוחות">
      {/* MONTH NAVIGATOR */}
      <div className="month-nav">
        <button
          aria-label="חודש קודם"
          onClick={() => setOffset((o) => o + 1)}
        >
          ›
        </button>
        <div className="lbl">
          <div className="m">
            {hebrewMonth(monthDate.getMonth())} {monthDate.getFullYear()}
          </div>
          {current && <div className="tiny muted">החודש הנוכחי</div>}
        </div>
        <button
          aria-label="חודש הבא"
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
        >
          ‹
        </button>
      </div>

      {!loaded ? null : count === 0 ? (
        <div className="empty">
          <div className="em">📊</div>
          <div className="t">אין הוצאות בחודש זה</div>
          <div className="s">בחר חודש אחר בעזרת החיצים למעלה.</div>
        </div>
      ) : (
        <>
          {/* HERO */}
          <div className="hero">
            <div className="spread">
              <span className="label">סך ההוצאות</span>
              {trendChip(change)}
            </div>
            <div className="amount tnum">{formatMoney(total)}</div>
            <div className="budget-row">
              <span className="lbl">מתוך תקציב חודשי</span>
              <span className="val tnum">{formatMoney(monthlyBudget)}</span>
            </div>
            <div className={`progress ${overBudget ? "over" : usedRatio > 0.8 ? "warn" : ""}`}>
              <span style={{ width: `${Math.min(100, usedRatio * 100)}%` }} />
            </div>
            <div className="tiny muted" style={{ marginTop: 8 }}>
              {formatPercent(Math.min(1, usedRatio))} מהתקציב ·{" "}
              {overBudget
                ? `חריגה של ${formatMoney(total - monthlyBudget)}`
                : `נותרו ${formatMoney(monthlyBudget - total)}`}
            </div>
          </div>

          {/* STAT CARDS */}
          <div className="stats" style={{ marginTop: 16 }}>
            <div className="stat">
              <div className="k">מספר הוצאות</div>
              <div className="v tnum">{count}</div>
              <div className="sub muted">{current ? "עד כה" : "בחודש"}</div>
            </div>
            <div className="stat">
              <div className="k">ממוצע יומי</div>
              <div className="v tnum">{formatMoney(Math.round(avg))}</div>
              <div className="sub muted">לכל החודש</div>
            </div>
            <div className="stat">
              <div className="k">קבועות</div>
              <div className="v tnum" style={{ fontSize: 18 }}>
                {formatMoney(recurring)}
              </div>
              <div className="sub muted">{formatPercent(recurringRatio)} מההוצאות</div>
            </div>
            <div className="stat">
              <div className="k">חד‑פעמיות</div>
              <div className="v tnum" style={{ fontSize: 18 }}>
                {formatMoney(oneTime)}
              </div>
              <div className="sub muted">{formatPercent(1 - recurringRatio)} מההוצאות</div>
            </div>
          </div>

          {biggest && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="spread">
                <span className="muted tiny">ההוצאה הגדולה בחודש</span>
                <span className="tnum" style={{ fontWeight: 800 }}>
                  {formatMoney(biggest.amount)}
                </span>
              </div>
              <div className="row" style={{ gap: 10, marginTop: 8 }}>
                <span
                  className="ic"
                  style={{
                    background: getCategory(biggest.categoryId).color,
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 16,
                    color: "#fff",
                  }}
                >
                  {getCategory(biggest.categoryId).icon}
                </span>
                <span style={{ fontWeight: 700 }}>{biggest.title}</span>
              </div>
            </div>
          )}

          {/* 6-MONTH TREND */}
          <div className="section-h">
            <h3>מגמה — 6 חודשים</h3>
          </div>
          <div className="card">
            <div className="bars">
              {trail.map((t) => {
                const sel = t.month === monthDate.getMonth() && t.year === monthDate.getFullYear();
                return (
                  <div className="bar" key={`${t.year}-${t.month}`}>
                    <div className="track">
                      <span
                        className={sel ? "fill sel" : "fill"}
                        style={{ height: `${Math.max(4, (t.total / trailMax) * 100)}%` }}
                      />
                    </div>
                    <div className="bl">{hebrewMonth(t.month).slice(0, 3)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CATEGORY DONUT */}
          {slices.length > 0 && (
            <>
              <div className="section-h">
                <h3>פילוח לפי קטגוריה</h3>
              </div>
              <div className="card">
                <div className="donut-wrap">
                  <div className="donut" style={{ background: donutBg }}>
                    <div className="hole" />
                    <div className="center">
                      <div>
                        <div className="t">סה״כ</div>
                        <div className="a tnum">{formatMoney(total)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="legend">
                    {slices.map((s) => (
                      <div className="li" key={s.category.id}>
                        <span className="sw" style={{ background: s.category.color }} />
                        {s.category.he}
                        <span className="pc">{formatPercent(s.ratio)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {current && (
            <div style={{ marginTop: 18 }}>
              <Link href="/expenses" className="btn ghost">
                לכל הוצאות החודש
              </Link>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
