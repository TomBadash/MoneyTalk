"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { formatMoney, formatPercent, hebrewMonth } from "@/lib/format";
import {
  monthTotal,
  dailyAverage,
  projectedMonthEnd,
  allowedDailyForRest,
  daysRemaining,
} from "@/lib/selectors";

export default function BudgetPage() {
  const { expenses, loaded, monthlyBudget, setMonthlyBudget } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!loaded) {
    return (
      <AppShell title="תקציב">
        <div className="card" style={{ opacity: 0.5 }}>טוען…</div>
      </AppShell>
    );
  }

  const now = new Date();
  const used = monthTotal(expenses, now);
  const remaining = monthlyBudget - used;
  const usedRatio = monthlyBudget > 0 ? used / monthlyBudget : 0;
  const projected = projectedMonthEnd(expenses, now);
  const allowedDaily = allowedDailyForRest(expenses, monthlyBudget, now);
  const daysLeft = daysRemaining(now);
  const avg = Math.round(dailyAverage(expenses, now));

  const progressClass = usedRatio > 1 ? "over" : usedRatio > 0.85 ? "warn" : "";

  // alert state
  type Alert = { tone: "ok" | "warn" | "over"; text: string };
  const alert: Alert = (() => {
    if (used > monthlyBudget)
      return {
        tone: "over",
        text: `חרגת מהתקציב ב‑${formatMoney(used - monthlyBudget)}.`,
      };
    if (usedRatio > 0.85)
      return {
        tone: "warn",
        text: `אתה מתקרב לתקציב — נותרו ${formatMoney(remaining)} ל‑${daysLeft} ימים.`,
      };
    if (projected > monthlyBudget)
      return {
        tone: "warn",
        text: `בקצב הנוכחי צפויה חריגה מהתקציב לקראת סוף החודש.`,
      };
    return {
      tone: "ok",
      text: `אתה בקצב טוב — נותרו ${formatMoney(remaining)} לשארית החודש.`,
    };
  })();

  const toneBg: Record<Alert["tone"], string> = {
    ok: "var(--accent-soft)",
    warn: "var(--warning-soft)",
    over: "var(--negative-soft)",
  };
  const toneInk: Record<Alert["tone"], string> = {
    ok: "var(--accent)",
    warn: "var(--warning)",
    over: "var(--negative)",
  };

  function startEdit() {
    setDraft(String(monthlyBudget));
    setEditing(true);
  }
  function saveEdit() {
    const v = Number(draft);
    if (v > 0) setMonthlyBudget(v);
    setEditing(false);
  }

  return (
    <AppShell title="תקציב" subtitle={`${hebrewMonth(now.getMonth())} ${now.getFullYear()}`}>
      {/* overview */}
      <div className="card">
        <div className="spread">
          <span className="muted" style={{ fontWeight: 600, fontSize: 14 }}>
            תקציב חודשי
          </span>
          {!editing && (
            <button
              className="sort"
              style={{ padding: "6px 12px" }}
              onClick={startEdit}
            >
              ✎ עריכה
            </button>
          )}
        </div>

        {editing ? (
          <div className="row" style={{ gap: 10, marginTop: 12 }}>
            <div className="with-cur" style={{ flex: 1 }}>
              <input
                className="input input-lg tnum"
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                autoFocus
              />
              <span className="cur">₪</span>
            </div>
            <button className="btn" style={{ width: "auto", padding: "14px 20px" }} onClick={saveEdit}>
              שמירה
            </button>
          </div>
        ) : (
          <div className="amount tnum" style={{ fontSize: 38, marginTop: 4 }}>
            {formatMoney(monthlyBudget)}
          </div>
        )}

        <div className="budget-row">
          <span className="lbl">נוצל {formatPercent(Math.min(1, usedRatio))}</span>
          <span className="val tnum">
            {formatMoney(used)}{" "}
            <span className="muted tiny">מתוך {formatMoney(monthlyBudget)}</span>
          </span>
        </div>
        <div className={`progress ${progressClass}`}>
          <span style={{ width: `${Math.min(100, usedRatio * 100)}%` }} />
        </div>

        {/* alert banner */}
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 14,
            background: toneBg[alert.tone],
            color: toneInk[alert.tone],
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {alert.tone === "over" ? "⚠️ " : alert.tone === "warn" ? "⏳ " : "✓ "}
          {alert.text}
        </div>
      </div>

      {/* metrics */}
      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat">
          <div className="k">נותר לתקציב</div>
          <div className="v tnum" style={{ color: remaining < 0 ? "var(--negative)" : undefined }}>
            {formatMoney(remaining)}
          </div>
          <div className="sub muted">{daysLeft} ימים נותרו</div>
        </div>
        <div className="stat">
          <div className="k">מותר ליום</div>
          <div className="v tnum">{formatMoney(Math.max(0, allowedDaily))}</div>
          <div className="sub muted">לשארית החודש</div>
        </div>
        <div className="stat">
          <div className="k">צפי לסוף החודש</div>
          <div className="v tnum">{formatMoney(projected)}</div>
          <div className={`sub ${projected > monthlyBudget ? "neg" : "pos"}`}>
            {projected > monthlyBudget ? "מעל התקציב" : "בתוך התקציב"}
          </div>
        </div>
        <div className="stat">
          <div className="k">ממוצע יומי</div>
          <div className="v tnum">{formatMoney(avg)}</div>
          <div className="sub muted">החודש</div>
        </div>
      </div>

      {/* forecast */}
      <div className="section-h">
        <h3>תחזית</h3>
      </div>
      <div className="insight">
        <div className="top">
          <span className="badge">✦</span>
          <b>תחזית חודשית</b>
        </div>
        <p>
          אם תמשיך בקצב הנוכחי, תסיים את החודש עם <b>{formatMoney(projected)}</b>{" "}
          הוצאות
          {projected > monthlyBudget
            ? ` — חריגה של ${formatMoney(projected - monthlyBudget)} מהתקציב.`
            : ` — בתוך התקציב, עם שוליים של ${formatMoney(monthlyBudget - projected)}.`}
        </p>
      </div>
    </AppShell>
  );
}
