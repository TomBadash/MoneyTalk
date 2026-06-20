"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { getCategory } from "@/lib/categories";
import { getPaymentMethod } from "@/lib/payment-methods";
import {
  formatMoney,
  formatPercent,
  formatTime,
  relativeDayLabel,
} from "@/lib/format";
import {
  monthTotal,
  weekTotal,
  prevWeekTotal,
  dailyAverage,
  recent,
  categoryBreakdown,
  topCategory,
  largestThisWeek,
  pctChange,
  inMonth,
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

export default function DashboardPage() {
  const { expenses, loaded, monthlyBudget } = useStore();

  if (!loaded) {
    return (
      <AppShell>
        <div className="hero" style={{ opacity: 0.5 }}>
          <span className="label">הוצאות החודש</span>
          <div className="amount tnum">…</div>
        </div>
      </AppShell>
    );
  }

  const now = new Date();
  const month = monthTotal(expenses, now);
  const prevMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const prevMonth = monthTotal(expenses, prevMonthRef);
  const monthChange = pctChange(month, prevMonth);

  const week = weekTotal(expenses, now);
  const weekChange = pctChange(week, prevWeekTotal(expenses, now));
  const avg = dailyAverage(expenses, now);

  const remaining = monthlyBudget - month;
  const usedRatio = monthlyBudget > 0 ? month / monthlyBudget : 0;
  const progressClass =
    usedRatio > 1 ? "over" : usedRatio > 0.8 ? "warn" : "";

  const slices = categoryBreakdown(expenses, now).slice(0, 6);
  const top = topCategory(expenses, now);
  const largest = largestThisWeek(expenses, now);
  const monthCount = expenses.filter((e) => inMonth(e, now)).length;
  // The dashboard reflects the current month only (past months live in Reports).
  const recentItems = recent(expenses.filter((e) => inMonth(e, now)), 4);

  // donut gradient from slices
  let acc = 0;
  const stops = slices
    .map((s) => {
      const from = acc * 100;
      acc += s.ratio;
      const to = acc * 100;
      return `${s.category.color} ${from}% ${to}%`;
    })
    .join(", ");
  const donutBg =
    slices.length > 0
      ? `conic-gradient(${stops})`
      : "var(--surface-2)";

  // rule-based weekly insight
  const insight = (() => {
    if (week === 0) return "השבוע עדיין לא נרשמו הוצאות. הוסף הוצאה כדי לראות תובנות.";
    const dir =
      weekChange == null
        ? null
        : weekChange > 0.02
        ? `עלייה של ${Math.round(weekChange * 100)}%`
        : weekChange < -0.02
        ? `ירידה של ${Math.round(Math.abs(weekChange) * 100)}%`
        : null;
    const parts = [`השבוע הוצאת ${formatMoney(week)}`];
    if (dir) parts.push(`${dir} לעומת השבוע שעבר`);
    let s = parts.join(" — ") + ".";
    if (top) s += ` רוב ההוצאות היו בקטגוריית ${top.category.he}.`;
    return s;
  })();

  return (
    <AppShell>
      {/* HERO */}
      <div className="hero">
        <div className="spread">
          <span className="label">הוצאות החודש</span>
          {trendChip(monthChange)}
        </div>
        <div className="amount tnum">{formatMoney(month)}</div>

        <Link href="/budget" style={{ display: "block" }}>
          <div className="budget-row">
            <span className="lbl">תקציב שנותר</span>
            <span className="val tnum">
              {formatMoney(Math.max(0, remaining))}{" "}
              <span className="muted tiny">
                מתוך {formatMoney(monthlyBudget)}
              </span>
            </span>
          </div>
          <div className={`progress ${progressClass}`}>
            <span style={{ width: `${Math.min(100, usedRatio * 100)}%` }} />
          </div>
          <div className="tiny muted" style={{ marginTop: 8 }}>
            {formatPercent(Math.min(1, usedRatio))} מהתקציב נוצל · {monthCount}{" "}
            הוצאות החודש · ניהול תקציב ←
          </div>
        </Link>
      </div>

      {/* STAT CARDS */}
      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat">
          <div className="k">הוצאות השבוע</div>
          <div className="v tnum">{formatMoney(week)}</div>
          <div className={`sub ${weekChange && weekChange > 0 ? "neg" : "pos"}`}>
            {weekChange == null
              ? "7 ימים אחרונים"
              : `${weekChange > 0 ? "▲" : "▼"} ${Math.round(
                  Math.abs(weekChange) * 100
                )}% מהשבוע שעבר`}
          </div>
        </div>
        <div className="stat">
          <div className="k">ממוצע יומי</div>
          <div className="v tnum">{formatMoney(Math.round(avg))}</div>
          <div className="sub muted">החודש</div>
        </div>
        <div className="stat">
          <div className="k">קטגוריה מובילה</div>
          <div className="v" style={{ fontSize: 18 }}>
            {top ? `${top.category.icon} ${top.category.he}` : "—"}
          </div>
          <div className="sub muted">
            {top ? formatMoney(top.total) : "אין נתונים"}
          </div>
        </div>
        <div className="stat">
          <div className="k">ההוצאה הגדולה השבוע</div>
          <div className="v tnum" style={{ fontSize: 18 }}>
            {largest ? formatMoney(largest.amount) : "—"}
          </div>
          <div className="sub muted">{largest ? largest.title : "—"}</div>
        </div>
      </div>

      {/* AI INSIGHT */}
      <div className="section-h">
        <h3>תובנה שבועית</h3>
      </div>
      <div className="insight">
        <div className="top">
          <span className="badge">✦</span>
          <b>MoneyTalk חושב…</b>
        </div>
        <p>{insight}</p>
      </div>

      {/* CATEGORY DONUT */}
      {slices.length > 0 && (
        <>
          <div className="section-h">
            <h3>פילוח לפי קטגוריה</h3>
            <Link href="/expenses">הכול ←</Link>
          </div>
          <div className="card">
            <div className="donut-wrap">
              <div className="donut" style={{ background: donutBg }}>
                <div className="hole" />
                <div className="center">
                  <div>
                    <div className="t">סה״כ החודש</div>
                    <div className="a tnum">{formatMoney(month)}</div>
                  </div>
                </div>
              </div>
              <div className="legend">
                {slices.map((s) => (
                  <div className="li" key={s.category.id}>
                    <span
                      className="sw"
                      style={{ background: s.category.color }}
                    />
                    {s.category.he}
                    <span className="pc">{formatPercent(s.ratio)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* RECENT */}
      <div className="section-h">
        <h3>הוצאות אחרונות</h3>
        <Link href="/expenses">הכול ←</Link>
      </div>
      {recentItems.length === 0 ? (
        <div className="empty">
          <div className="em">💸</div>
          <div className="t">אין עדיין הוצאות</div>
          <div className="s">לחץ על + כדי להוסיף את ההוצאה הראשונה.</div>
        </div>
      ) : (
        <div className="exp-list">
          {recentItems.map((e) => {
            const cat = getCategory(e.categoryId);
            const pm = getPaymentMethod(e.paymentMethodId);
            const isFixed = Boolean(e.recurringId) || e.note === "הוצאה קבועה";
            return (
              <div className="exp" key={e.id}>
                <span className="ic" style={{ background: cat.color }}>
                  {cat.icon}
                </span>
                <div className="meta">
                  <div className="t">{e.title}</div>
                  <div className="s">
                    {cat.he}
                    {isFixed ? " · הוצאה קבועה" : ` · ${relativeDayLabel(e.date)} ${formatTime(e.date)}`}
                    {pm && ` · ${pm.he}`}
                  </div>
                </div>
                <span className={`amt tnum${isFixed ? " fixed" : ""}`}>
                  {formatMoney(e.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
