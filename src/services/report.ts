import type { Agorot, Txn } from "@/domain/types";
import { isConsumption } from "@/engine/consumption";
import { pctChange } from "@/engine/money";
import { addMonths, daysInMonth, monthKey } from "@/engine/period";
import { nodeInfo } from "@/classify/taxonomy";
import { detectRecurring } from "@/engine/recurring";

export type MonthlyReport = {
  month: string; prevMonth: string;
  total: Agorot; prevTotal: Agorot; change: number | null;
  fixed: Agorot; variable: Agorot; oneOff: Agorot;
  income: Agorot; saved: Agorot; invested: Agorot; savingsRate: number | null;
  largestCategory: { id: string; name: string; amount: Agorot } | null;
  biggestIncrease: { id: string; name: string; delta: Agorot; pct: number | null } | null;
  weeklyAvg: Agorot; prevWeeklyAvg: Agorot;
  insights: string[];
  hasData: boolean;
};

const nis = (a: Agorot) => `₪${Math.round(Math.abs(a) / 100).toLocaleString("he-IL")}`;

export function buildMonthlyReport(all: Txn[], month: string): MonthlyReport {
  const prevMonth = monthKey(addMonths(`${month}-01`, -1));
  const inM = (t: Txn, m: string) => t.date.slice(0, 7) === m;
  const cur = all.filter((t) => inM(t, month) && isConsumption(t));
  const prev = all.filter((t) => inM(t, prevMonth) && isConsumption(t));
  const sum = (ts: Txn[]) => ts.reduce((s, t) => s + t.amount, 0);
  const total = sum(cur), prevTotal = sum(prev);
  const fixed = sum(cur.filter((t) => t.consumptionType === "fixed"));
  const oneOff = sum(cur.filter((t) => t.consumptionType === "one_off"));
  const income = all.filter((t) => inM(t, month) && t.financialType === "income").reduce((s, t) => s + t.amount, 0);
  const invested = all.filter((t) => inM(t, month) && (t.financialType === "investment" || t.financialType === "savings")).reduce((s, t) => s + t.amount, 0);
  const saved = income - total;

  const byCat = (ts: Txn[]) => { const m = new Map<string, number>(); ts.forEach((t) => t.categoryId && m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount)); return m; };
  const c1 = byCat(cur), c0 = byCat(prev);
  const ranked = [...c1.entries()].sort((a, b) => b[1] - a[1]);
  const largest = ranked[0] ? { id: ranked[0][0], name: nodeInfo(ranked[0][0]).he, amount: ranked[0][1] } : null;
  const deltas = [...new Set([...c1.keys(), ...c0.keys()])].map((id) => ({ id, delta: (c1.get(id) ?? 0) - (c0.get(id) ?? 0), pct: pctChange(c1.get(id) ?? 0, c0.get(id) ?? 0) }));
  const up = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta)[0];

  const weeks = (m: string) => daysInMonth(`${m}-01`) / 7;
  const weeklyAvg = Math.round(total / weeks(month)), prevWeeklyAvg = Math.round(prevTotal / weeks(prevMonth));

  const insights: string[] = [];
  const nameOf = (id: string) => nodeInfo(id).he;
  const notable = deltas.filter((d) => Math.abs(d.delta) >= 10_000 && (d.pct == null || Math.abs(d.pct) >= 0.12) && (c0.get(d.id) ?? 0) > 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
  for (const d of notable) {
    insights.push(d.delta < 0
      ? `הוצאת ${nis(d.delta)} פחות על ${nameOf(d.id)} לעומת ${prevMonth.slice(5)}/${prevMonth.slice(2, 4)}.`
      : `הוצאת ${nis(d.delta)} יותר על ${nameOf(d.id)}${d.pct != null ? ` (+${Math.round(d.pct * 100)}%)` : ""}.`);
  }
  if (prevTotal > 0 && Math.abs(weeklyAvg - prevWeeklyAvg) >= 5_000) {
    insights.push(`ההוצאה השבועית הממוצעת שלך ${weeklyAvg < prevWeeklyAvg ? "ירדה" : "עלתה"} מ-${nis(prevWeeklyAvg)} ל-${nis(weeklyAvg)}.`);
  }
  const subs = detectRecurring(all.filter((t) => t.date <= `${month}-31`), `${month}-${String(daysInMonth(`${month}-01`)).padStart(2, "0")}`)
    .filter((r) => r.active && r.categoryId === "c_subscriptions");
  if (subs.length >= 2) insights.push(`שילמת על ${subs.length} מנויים פעילים, בסך ${nis(subs.reduce((s, r) => s + r.amount, 0))} בחודש.`);
  if (income > 0 && saved > 0) insights.push(`חסכת ${nis(saved)} — ${Math.round((saved / income) * 100)}% מההכנסה.`);

  return {
    month, prevMonth, total, prevTotal, change: pctChange(total, prevTotal), fixed, variable: total - fixed - oneOff, oneOff,
    income, saved, invested, savingsRate: income > 0 ? saved / income : null, largestCategory: largest,
    biggestIncrease: up ? { id: up.id, name: nameOf(up.id), delta: up.delta, pct: up.pct } : null,
    weeklyAvg, prevWeeklyAvg, insights: insights.slice(0, 5), hasData: total > 0,
  };
}
