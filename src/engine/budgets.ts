import type { Agorot, IsoDate, Txn } from "@/domain/types";
import { isConsumption } from "./consumption";
import { addDays, addMonths, monthKey, monthStart } from "./period";

export type BudgetSuggestion = {
  categoryId: string;
  current: Agorot | null;
  suggested: Agorot;
  avg4m: Agorot;
  rationaleNumbers: { months: number; avgMonthly: Agorot; recentWeeklyAvg: Agorot };
};

const round10 = (a: Agorot) => Math.round(a / 1000) * 1000; // nearest ₪10

/**
 * Suggest next month's budget for a category: blend of the last-4-months average (excluding
 * one-offs and the current partial month) and a 12-month average when available, nudged
 * 50% of the way from the current target toward observed behaviour so budgets improve gradually.
 */
export function suggestCategoryBudget(
  categoryId: string,
  history: Txn[],
  current: Agorot | null,
  today: IsoDate,
): BudgetSuggestion | null {
  const thisMonth = monthStart(today);
  const rows = history.filter((t) => isConsumption(t) && t.categoryId === categoryId && t.consumptionType !== "one_off" && t.date < thisMonth);
  const byMonth = new Map<string, Agorot>();
  for (const t of rows) byMonth.set(monthKey(t.date), (byMonth.get(monthKey(t.date)) ?? 0) + t.amount);
  const months: string[] = [];
  for (let k = 1; k <= 12; k++) months.push(monthKey(addMonths(thisMonth, -k)));
  const last4 = months.slice(0, 4).filter((m) => byMonth.has(m));
  if (last4.length < 2) return null;
  const avg = (ms: string[]) => Math.round(ms.reduce((s, m) => s + (byMonth.get(m) ?? 0), 0) / ms.length);
  const avg4 = avg(last4);
  const all = months.filter((m) => byMonth.has(m));
  const target = all.length >= 6 ? Math.round(avg4 * 0.7 + avg(all) * 0.3) : avg4;
  const suggested = round10(current == null ? target : current + (target - current) * 0.5);
  if (current != null && Math.abs(suggested - current) < Math.max(5000, current * 0.05)) return null; // not worth surfacing
  const from = addDays(today, -28);
  const recent = rows.filter((t) => t.date >= from).reduce((s, t) => s + t.amount, 0);
  return { categoryId, current, suggested, avg4m: avg4, rationaleNumbers: { months: last4.length, avgMonthly: avg4, recentWeeklyAvg: Math.round(recent / 4) } };
}
