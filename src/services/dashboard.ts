import type { Agorot, IsoDate, Profile, Txn } from "@/domain/types";
import type { Repo } from "@/db/repo";
import { isConsumption, isVariable } from "@/engine/consumption";
import { addDays, addMonths, diffDays, monthEnd, monthKey, monthStart } from "@/engine/period";
import { computeSafeToSpend, learnDayWeights, availableVariable, type PacePoint, type PaceStatus } from "@/engine/safe-to-spend";
import { computeForecast, type Confidence } from "@/engine/forecast";
import { detectRecurring, recurringAlerts, recurringForMonth } from "@/engine/recurring";
import { installmentPlans } from "@/engine/installments";
import { buildInsights, topInsights, type Insight } from "@/engine/insights-rules";
import { nodeInfo } from "@/classify/taxonomy";

export type DashboardPayload = {
  asOf: IsoDate;
  demo: boolean;
  hasData: boolean;
  monthKey: string;
  daysLeft: number;
  remainingMonth: Agorot; // negative = over target
  monthTarget: Agorot;
  targetDerived: boolean;
  remainingWeek: Agorot;
  todayAllowance: Agorot;
  spentMonth: Agorot; // all consumption this month
  spentVariable: Agorot;
  forecast: { savings: Agorot; savingsRate: number; totalSpending: Agorot; variableSpending: Agorot; variance: Agorot; confidence: Confidence };
  pace: { points: PacePoint[]; status: PaceStatus; idealToDate: Agorot; spentToDate: Agorot };
  categories: { id: string; name: string; color: string; icon: string; amount: Agorot; budget: Agorot | null }[];
  upcoming: { title: string; amount: Agorot; date: IsoDate; kind: "recurring" | "installment" }[];
  insights: Insight[];
  reviewCount: number;
};

export type DashboardInput = {
  today: IsoDate;
  profile: Profile;
  txns: Txn[]; // ≥ 12 months ideally, all ≤ today
  budgets: { categoryId: string | null; amount: Agorot }[];
  demo?: boolean;
};

const sumAmt = (ts: Txn[]) => ts.reduce((s, t) => s + t.amount, 0);

/** Average monthly income inferred from salary-like credits over the last 3 full months. */
export function inferIncome(txns: Txn[], today: IsoDate): Agorot {
  const from = addMonths(monthStart(today), -3), to = monthStart(today);
  const m = new Map<string, Agorot>();
  for (const t of txns) if (t.financialType === "income" && t.date >= from && t.date < to) m.set(monthKey(t.date), (m.get(monthKey(t.date)) ?? 0) + t.amount);
  return m.size ? Math.round([...m.values()].reduce((a, b) => a + b, 0) / m.size) : 0;
}

/** Deterministic: same inputs → same dashboard. No I/O, no AI. */
export function buildDashboard(i: DashboardInput): DashboardPayload {
  const { today } = i;
  const txns = i.txns.filter((t) => t.date <= today);
  const mStart = monthStart(today), mEnd = monthEnd(today);
  const monthTxns = txns.filter((t) => t.date >= mStart);
  const consumption = monthTxns.filter(isConsumption);

  const detected = detectRecurring(txns, today);
  const fixedRules = detected.filter((r) => r.consumptionType === "fixed" || r.consumptionType == null);
  const fixedRec = recurringForMonth(fixedRules, monthTxns, today);
  const allRec = recurringForMonth(detected, monthTxns, today);

  const plans = installmentPlans(txns);
  const instUpcoming = plans
    .filter((p) => p.remaining > 0 && monthKey(p.lastDate) !== monthKey(today) && diffDays(today, p.lastDate) <= 45)
    .map((p) => ({ title: p.merchant, amount: p.monthly, date: addMonths(p.lastDate, 1), kind: "installment" as const }))
    .filter((u) => u.date >= today && u.date <= mEnd);
  const instMerchants = new Set(plans.map((p) => p.merchant));

  const fixedPaid = sumAmt(consumption.filter((t) => t.consumptionType === "fixed"));
  const oneOffSoFar = sumAmt(consumption.filter((t) => t.consumptionType === "one_off"));
  const knownUpcoming = instUpcoming.reduce((s, u) => s + u.amount, 0);

  const income = i.profile.monthlyIncome || inferIncome(txns, today);
  const profile: Profile = { ...i.profile, monthlyIncome: income };
  const overallBudget = i.budgets.find((b) => b.categoryId == null)?.amount ?? null;
  const userTarget = profile.variableTarget ?? overallBudget;

  const variableByDay = new Map<IsoDate, Agorot>();
  for (const t of monthTxns) if (isVariable(t)) variableByDay.set(t.date, (variableByDay.get(t.date) ?? 0) + t.amount);
  const weights = learnDayWeights(txns, today);

  // history → daily variable average over the 90 days before this month
  const histFrom = addDays(mStart, -90);
  const histTxns = txns.filter((t) => t.date >= histFrom && t.date < mStart && isVariable(t));
  const earliest = txns.reduce<string | null>((e, t) => (e == null || t.date < e ? t.date : e), null);
  const historyDays = earliest ? diffDays(today, earliest) + 1 : 0;
  const histSpan = earliest ? Math.min(90, Math.max(1, diffDays(mStart, earliest))) : 1;
  const historicalDaily = histTxns.length ? Math.round(sumAmt(histTxns) / histSpan) : 0;

  // Until history reveals the real fixed bills, assume rent + a typical ₪1,300 of other fixed costs (arnona, utilities, phone, internet).
  const fixedFloor = profile.monthlyRent > 0 ? profile.monthlyRent + 130_000 : 0;
  const fixedMonth = Math.max(fixedPaid + fixedRec.remaining, fixedFloor);
  let target = userTarget;
  const derived = userTarget == null;
  if (target == null) {
    target = Math.max(0, availableVariable(profile, fixedMonth, knownUpcoming));
    if (target === 0 && historicalDaily > 0) target = historicalDaily * 30; // no income info → mirror observed behaviour
  }

  const sts = computeSafeToSpend({
    today, profile: { ...profile, variableTarget: target }, fixedMonth, knownUpcoming, variableByDay, weights,
  });
  const forecast = computeForecast({
    today, profile, weights, variableSpent: sts.spent, historicalDaily, historyDays,
    fixedPaid, fixedExpected: fixedRec.remaining + knownUpcoming, oneOffSoFar, variableTarget: target,
  });

  // categories: variable spending only — fixed bills are not interesting to scan daily
  const byCat = new Map<string, Agorot>();
  for (const t of consumption) if (isVariable(t) && t.categoryId) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
  const categories = [...byCat.entries()]
    .filter(([, a]) => a >= 5_000)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, amount]) => {
      const n = nodeInfo(id);
      return { id, name: n.he, color: n.color, icon: n.icon, amount, budget: i.budgets.find((b) => b.categoryId === id)?.amount ?? null };
    });

  const upcoming = [
    ...allRec.upcoming.filter((u) => !instMerchants.has(u.title.toLowerCase())).map((u) => ({ ...u, kind: "recurring" as const })),
    ...instUpcoming,
  ].filter((u) => u.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

  const alerts = recurringAlerts(txns, detected, today);
  const insights = topInsights(buildInsights({
    today, txns, forecast: { ...forecast, savings: forecast.savings }, variableTarget: target, alerts,
    categoryName: (id) => nodeInfo(id).he,
  }));

  return {
    asOf: today, demo: !!i.demo, hasData: txns.length > 0, monthKey: monthKey(today),
    daysLeft: diffDays(mEnd, today) + 1,
    remainingMonth: sts.remainingMonth, monthTarget: target, targetDerived: derived,
    remainingWeek: sts.remainingWeek, todayAllowance: sts.todayAllowance,
    spentMonth: sumAmt(consumption), spentVariable: sts.spent,
    forecast: {
      savings: forecast.savings, savingsRate: forecast.savingsRate, totalSpending: forecast.totalSpending,
      variableSpending: forecast.variableSpending, variance: forecast.budgetVariance, confidence: forecast.confidence,
    },
    pace: { points: sts.pace, status: sts.status, idealToDate: sts.idealToDate, spentToDate: sts.spent },
    categories, upcoming, insights,
    reviewCount: txns.filter((t) => t.needsReview).length,
  };
}

/** Loads what the dashboard needs (one narrow query window) and builds the payload. */
export async function computeDashboard(repo: Repo, today: IsoDate, demo = false): Promise<DashboardPayload> {
  const [profile, txns, budgets] = await Promise.all([
    repo.profile(), repo.txns({ from: addMonths(monthStart(today), -12), to: today }), repo.budgets(),
  ]);
  return buildDashboard({ today, profile, txns, budgets, demo });
}

/**
 * Fast path used by the page: serve the precomputed snapshot when it is for today, otherwise
 * compute once and store it. Heavy AI never runs here — only deterministic math.
 */
export async function getDashboard(repo: Repo, today: IsoDate, demo = false): Promise<DashboardPayload> {
  if (!demo) {
    const snap = await repo.snapshot(today);
    if (snap) return snap.payload;
  }
  const payload = await computeDashboard(repo, today, demo);
  if (!demo) await repo.saveSnapshot(today, payload).catch(() => undefined);
  return payload;
}
