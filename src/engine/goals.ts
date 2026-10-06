import type { Agorot, Goal, IsoDate } from "@/domain/types";
import { addMonths, diffDays } from "./period";

export type GoalProgress = {
  remaining: Agorot;
  pct: number; // 0..1
  /** Monthly contribution needed to hit the target date (null without a date). */
  requiredMonthly: Agorot | null;
  /** Estimated completion at the current planned contribution (null without a contribution). */
  eta: IsoDate | null;
  done: boolean;
};

export function goalProgress(g: Goal, today: IsoDate): GoalProgress {
  const remaining = Math.max(0, g.target - g.current);
  const monthsLeft = g.targetDate ? Math.max(1, Math.ceil(diffDays(g.targetDate, today) / 30.44)) : null;
  return {
    remaining, pct: Math.min(1, g.current / g.target), done: remaining === 0,
    requiredMonthly: monthsLeft && remaining > 0 ? Math.ceil(remaining / monthsLeft) : monthsLeft ? 0 : null,
    eta: g.monthlyContribution && g.monthlyContribution > 0 && remaining > 0
      ? addMonths(today, Math.ceil(remaining / g.monthlyContribution)) : remaining === 0 ? today : null,
  };
}
