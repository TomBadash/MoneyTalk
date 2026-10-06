import type { Agorot, IsoDate, Profile } from "@/domain/types";
import { diffDays, eachDay, monthEnd, monthStart } from "./period";
import { dayWeight, type DayWeights } from "./safe-to-spend";

export type Confidence = "high" | "medium" | "low";

export type ForecastInput = {
  today: IsoDate;
  profile: Profile;
  weights: DayWeights;
  variableSpent: Agorot;
  /** Average variable spend per day over the past ~90 days (0 if unknown). */
  historicalDaily: Agorot;
  /** Days of history available (drives confidence). */
  historyDays: number;
  fixedPaid: Agorot;
  fixedExpected: Agorot; // still to come this month (recurring/known)
  oneOffSoFar: Agorot;
  /** Variable target the user compares against (monthly). */
  variableTarget: Agorot;
};

export type Forecast = {
  totalSpending: Agorot;
  variableSpending: Agorot;
  savings: Agorot;
  savingsRate: number; // 0..1 (can be negative)
  budgetVariance: Agorot; // projected variable − target; >0 means over
  confidence: Confidence;
};

export function computeForecast(i: ForecastInput): Forecast {
  const start = monthStart(i.today), end = monthEnd(i.today);
  const all = eachDay(start, end);
  const elapsed = Math.max(1, diffDays(i.today, start) + 1);
  const rest = eachDay(i.today, end).slice(1); // days after today
  const currentDaily = i.variableSpent / elapsed;
  const share = elapsed / all.length;
  const blended = i.historicalDaily > 0 ? share * currentDaily + (1 - share) * i.historicalDaily : currentDaily;

  // weekend-aware: scale so that the weights average to 1 over the whole month
  const meanW = all.reduce((s, d) => s + dayWeight(d, i.weights), 0) / all.length;
  const projectedRest = rest.reduce((s, d) => s + (blended * dayWeight(d, i.weights)) / meanW, 0);

  const variableSpending = Math.round(i.variableSpent + projectedRest);
  const totalSpending = variableSpending + i.fixedPaid + i.fixedExpected + i.oneOffSoFar;
  const savings = i.profile.monthlyIncome - totalSpending;
  const savingsRate = i.profile.monthlyIncome > 0 ? savings / i.profile.monthlyIncome : 0;

  const confidence: Confidence =
    i.historyDays >= 90 && share >= 0.25 ? "high" : i.historyDays >= 28 ? "medium" : "low";

  return {
    totalSpending, variableSpending, savings, savingsRate,
    budgetVariance: variableSpending - i.variableTarget, confidence,
  };
}
