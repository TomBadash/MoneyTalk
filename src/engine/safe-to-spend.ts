import type { Agorot, IsoDate, Profile, Txn } from "@/domain/types";
import { allocate } from "./money";
import { addDays, daysInMonth, diffDays, eachDay, isWeekend, monthEnd, monthStart, weekEnd } from "./period";
import { isVariable } from "./consumption";

export type DayWeights = { weekday: number; weekend: number };

/**
 * Relative weight of a weekend day vs a weekday, learned from history.
 * Falls back to uniform (1/1) when there is under 4 weeks of data — never invent a pattern.
 */
export function learnDayWeights(history: Txn[], today: IsoDate, lookbackDays = 90): DayWeights {
  const from = addDays(today, -lookbackDays);
  const byDay = new Map<IsoDate, number>();
  for (const t of history) {
    if (!isVariable(t) || t.date < from || t.date >= today) continue;
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount);
  }
  const first = [...byDay.keys()].sort()[0];
  if (!first || diffDays(today, first) < 28) return { weekday: 1, weekend: 1 };
  let wd = 0, wdN = 0, we = 0, weN = 0;
  for (const d of eachDay(first, addDays(today, -1))) {
    const v = byDay.get(d) ?? 0;
    if (isWeekend(d)) { we += v; weN++; } else { wd += v; wdN++; }
  }
  if (!wdN || !weN || wd === 0) return { weekday: 1, weekend: 1 };
  const ratio = Math.min(2.5, Math.max(0.6, we / weN / (wd / wdN)));
  return { weekday: 1, weekend: ratio };
}

export const dayWeight = (d: IsoDate, w: DayWeights) => (isWeekend(d) ? w.weekend : w.weekday);

export type PacePoint = { date: IsoDate; ideal: Agorot; actual: Agorot | null };
export type PaceStatus = "over" | "on_track" | "under";

export type SafeToSpendInput = {
  today: IsoDate;
  profile: Profile;
  /** All fixed expenses expected this month (already paid + still upcoming). */
  fixedMonth: Agorot;
  /** Known upcoming non-recurring items this month (e.g. installments not in fixedMonth). */
  knownUpcoming?: Agorot;
  /** Variable spending per day so far this month (calendar date → agorot). */
  variableByDay: Map<IsoDate, Agorot>;
  weights: DayWeights;
};

export type SafeToSpend = {
  monthTarget: Agorot; // variable budget for the month
  derived: boolean; // true when computed from the income model, false when user set it
  spent: Agorot;
  remainingMonth: Agorot; // can be negative (overspent)
  remainingWeek: Agorot;
  todayAllowance: Agorot;
  pace: PacePoint[];
  status: PaceStatus;
  idealToDate: Agorot;
};

/** Expected income − fixed − planned savings − planned investments − known upcoming. */
export function availableVariable(p: Profile, fixedMonth: Agorot, knownUpcoming = 0): Agorot {
  return p.monthlyIncome - fixedMonth - p.monthlySavingsTarget - p.monthlyInvestmentTarget - knownUpcoming;
}

export function computeSafeToSpend(i: SafeToSpendInput): SafeToSpend {
  const { today, profile, weights } = i;
  const derivedTarget = Math.max(0, availableVariable(profile, i.fixedMonth, i.knownUpcoming));
  const derived = profile.variableTarget == null;
  const monthTarget = profile.variableTarget ?? derivedTarget;

  const start = monthStart(today);
  const end = monthEnd(today);
  const days = eachDay(start, end);

  const spent = [...i.variableByDay.entries()].reduce((s, [d, v]) => (d <= today ? s + v : s), 0);
  const remainingMonth = monthTarget - spent;

  // Ideal pace: the target spread over all days by weight.
  const idealPerDay = allocate(monthTarget, days.map((d) => dayWeight(d, weights)));
  let cumIdeal = 0, cumActual = 0;
  const pace: PacePoint[] = days.map((d, k) => {
    cumIdeal += idealPerDay[k];
    if (d <= today) cumActual += i.variableByDay.get(d) ?? 0;
    return { date: d, ideal: cumIdeal, actual: d <= today ? cumActual : null };
  });
  const idealToDate = pace.find((p) => p.date === today)?.ideal ?? 0;

  // Remaining money (never negative for allocation) spread over today..end by weight.
  // Spending today is already inside `spent`, so today's allowance = what is left of today's share.
  const restDays = eachDay(today, end);
  const pool = Math.max(0, remainingMonth);
  const alloc = allocate(pool, restDays.map((d) => dayWeight(d, weights)));
  const wkEnd = weekEnd(today) < end ? weekEnd(today) : end;
  let remainingWeek = 0;
  restDays.forEach((d, k) => { if (d <= wkEnd) remainingWeek += alloc[k]; });
  const todayAllowance = alloc[0] ?? 0;

  const tol = Math.max(5000, Math.round(monthTarget * 0.03));
  const diff = spent - idealToDate;
  const status: PaceStatus = diff > tol ? "over" : diff < -tol ? "under" : "on_track";

  return {
    monthTarget, derived, spent, remainingMonth,
    remainingWeek: remainingMonth < 0 ? remainingMonth : remainingWeek, // overspent: show the deficit
    todayAllowance, pace, status, idealToDate,
  };
}

export { daysInMonth };
