import type { Agorot, IsoDate } from "@/domain/types";
import type { Repo } from "@/db/repo";
import { suggestCategoryBudget, type BudgetSuggestion } from "@/engine/budgets";
import { isConsumption, isVariable } from "@/engine/consumption";
import { addMonths, monthKey, monthStart } from "@/engine/period";

/** Suggestions are for the month we are in during its first 10 days, otherwise for next month. */
export function suggestionPeriod(today: IsoDate): string {
  return monthKey(Number(today.slice(8, 10)) <= 10 ? today : addMonths(monthStart(today), 1));
}

export type OverallSuggestion = { current: Agorot | null; suggested: Agorot; avg3m: Agorot };

/** Overall variable target: move halfway from the current target toward the 3-month average. */
export function suggestOverall(history: { date: string; amount: Agorot; consumptionType?: string | null; financialType: string; transactionType: string }[], current: Agorot | null, today: IsoDate): OverallSuggestion | null {
  const thisMonth = monthStart(today);
  const byMonth = new Map<string, Agorot>();
  for (const t of history) {
    if (t.date >= thisMonth || !isVariable(t as never)) continue;
    byMonth.set(monthKey(t.date), (byMonth.get(monthKey(t.date)) ?? 0) + t.amount);
  }
  const last3 = [1, 2, 3].map((k) => monthKey(addMonths(thisMonth, -k))).filter((m) => byMonth.has(m));
  if (last3.length < 2) return null;
  const avg = Math.round(last3.reduce((s, m) => s + (byMonth.get(m) ?? 0), 0) / last3.length);
  const suggested = Math.round((current == null ? avg : current + (avg - current) * 0.5) / 1000) * 1000;
  if (current != null && Math.abs(suggested - current) < Math.max(10_000, current * 0.04)) return null;
  return { current, suggested, avg3m: avg };
}

export type BudgetSuggestionRow = { id?: string; categoryId: string | null; current: Agorot | null; suggested: Agorot; avg: Agorot; months: number; period: string; status: "pending" };

/** Compute (deterministically) what we would recommend; persisting is a separate step. */
export async function computeBudgetSuggestions(repo: Repo, today: IsoDate): Promise<BudgetSuggestionRow[]> {
  const [txns, budgets] = await Promise.all([repo.txns({ from: addMonths(monthStart(today), -12), to: today }), repo.budgets()]);
  const period = suggestionPeriod(today);
  const out: BudgetSuggestionRow[] = [];
  const overall = suggestOverall(txns, budgets.find((b) => b.categoryId == null)?.amount ?? null, today);
  if (overall) out.push({ categoryId: null, current: overall.current, suggested: overall.suggested, avg: overall.avg3m, months: 3, period, status: "pending" });

  // category budgets: only for categories the user already budgets (never force dozens of budgets on them)
  const budgeted = budgets.filter((b) => b.categoryId != null);
  for (const b of budgeted) {
    const s: BudgetSuggestion | null = suggestCategoryBudget(b.categoryId!, txns.filter(isConsumption), b.amount, today);
    if (s) out.push({ categoryId: s.categoryId, current: s.current, suggested: s.suggested, avg: s.avg4m, months: s.rationaleNumbers.months, period, status: "pending" });
  }
  return out;
}

/** Persist new recommendations (never re-offering one already seen for the period). */
export async function ensureSuggestions(repo: Repo, today: IsoDate): Promise<void> {
  const rows = await computeBudgetSuggestions(repo, today);
  await repo.upsertSuggestions(rows.map((r) => ({
    kind: "budget" as const, categoryId: r.categoryId, period: r.period, status: "pending" as const,
    payload: { current: r.current, suggested: r.suggested, avg: r.avg, months: r.months },
  })));
}

export { isConsumption };
