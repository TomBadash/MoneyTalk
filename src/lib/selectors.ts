// Pure derivations over Expense[] for the dashboard / reports.
import type { Expense } from "./store";
import { CATEGORIES, getCategory, type Category } from "./categories";

const DAY = 86_400_000;

function sum(list: Expense[]): number {
  return list.reduce((acc, e) => acc + e.amount, 0);
}

export function inMonth(e: Expense, ref: Date): boolean {
  const d = new Date(e.date);
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

function inRange(e: Expense, from: number, to: number): boolean {
  const t = new Date(e.date).getTime();
  return t >= from && t < to;
}

export function monthTotal(expenses: Expense[], ref = new Date()): number {
  return sum(expenses.filter((e) => inMonth(e, ref)));
}

/** Total for the trailing 7 days ending at `ref`. */
export function weekTotal(expenses: Expense[], ref = new Date()): number {
  const to = ref.getTime();
  return sum(expenses.filter((e) => inRange(e, to - 7 * DAY, to + 1)));
}

/** Total for the 7 days before the trailing week (for comparison). */
export function prevWeekTotal(expenses: Expense[], ref = new Date()): number {
  const to = ref.getTime() - 7 * DAY;
  return sum(expenses.filter((e) => inRange(e, to - 7 * DAY, to)));
}

export function dailyAverage(expenses: Expense[], ref = new Date()): number {
  const dayOfMonth = ref.getDate();
  return dayOfMonth > 0 ? monthTotal(expenses, ref) / dayOfMonth : 0;
}

export function recent(expenses: Expense[], n = 5): Expense[] {
  return [...expenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);
}

export type CategorySlice = {
  category: Category;
  total: number;
  ratio: number;
};

/** Month breakdown by category, descending, with ratios. */
export function categoryBreakdown(
  expenses: Expense[],
  ref = new Date()
): CategorySlice[] {
  const monthly = expenses.filter((e) => inMonth(e, ref));
  const total = sum(monthly);
  const byCat = new Map<string, number>();
  for (const e of monthly) {
    byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount);
  }
  return CATEGORIES.map((category) => ({
    category,
    total: byCat.get(category.id) ?? 0,
    ratio: total > 0 ? (byCat.get(category.id) ?? 0) / total : 0,
  }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function topCategory(
  expenses: Expense[],
  ref = new Date()
): CategorySlice | undefined {
  return categoryBreakdown(expenses, ref)[0];
}

export function largestThisWeek(
  expenses: Expense[],
  ref = new Date()
): Expense | undefined {
  const to = ref.getTime();
  const week = expenses.filter((e) => inRange(e, to - 7 * DAY, to + 1));
  return week.sort((a, b) => b.amount - a.amount)[0];
}

/** Percentage change a vs b, as a signed ratio (0.12 = +12%). null if b is 0. */
export function pctChange(a: number, b: number): number | null {
  if (b === 0) return null;
  return (a - b) / b;
}

// ── Budget math ────────────────────────────────────────
export function daysInMonth(ref = new Date()): number {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
}

/** Days left in the month, including today. */
export function daysRemaining(ref = new Date()): number {
  return Math.max(1, daysInMonth(ref) - ref.getDate() + 1);
}

/** Projected month-end spend if the current daily pace continues. */
export function projectedMonthEnd(expenses: Expense[], ref = new Date()): number {
  const elapsed = ref.getDate();
  if (elapsed === 0) return 0;
  const pace = monthTotal(expenses, ref) / elapsed;
  return Math.round(pace * daysInMonth(ref));
}

/** How much you can still spend per remaining day to stay within budget. */
export function allowedDailyForRest(
  expenses: Expense[],
  budget: number,
  ref = new Date()
): number {
  const remaining = budget - monthTotal(expenses, ref);
  return Math.round(remaining / daysRemaining(ref));
}

export { getCategory };
