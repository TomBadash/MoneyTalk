import type { Agorot, IsoDate, NotificationPrefs } from "@/domain/types";
import type { RecurringAlert } from "./recurring";
import { alertText } from "./insights-rules";
import { weekStart } from "./period";

export type NewNotification = { kind: string; title: string; body?: string; link?: string; dedupeKey: string };

export const DEFAULT_PREFS: NotificationPrefs = { budget_80: true, weekly_pace: true, price_change: true, new_recurring: true, weekly_left: true };

const nis = (a: Agorot) => `₪${Math.round(Math.abs(a) / 100).toLocaleString("he-IL")}`;

export type NotifyInput = {
  today: IsoDate;
  prefs?: Partial<NotificationPrefs>;
  categoryBudgets: { name: string; amount: Agorot; spent: Agorot; id: string }[];
  pace: { spentToDate: Agorot; idealToDate: Agorot; dayOfMonth: number };
  remainingWeek: Agorot;
  alerts: RecurringAlert[];
};

/** Useful, not annoying: each item has a dedupe key (per month / week / event), so it fires once. */
export function buildNotifications(i: NotifyInput): NewNotification[] {
  const p = { ...DEFAULT_PREFS, ...i.prefs };
  const out: NewNotification[] = [];
  const month = i.today.slice(0, 7), wk = weekStart(i.today);

  if (p.budget_80) for (const b of i.categoryBudgets) {
    const pct = b.spent / b.amount;
    if (pct >= 1) out.push({ kind: "budget", title: `חרגת מתקציב ${b.name}`, body: `${nis(b.spent)} מתוך ${nis(b.amount)} החודש.`, link: `/transactions?cat=${b.id}`, dedupeKey: `b100:${b.id}:${month}` });
    else if (pct >= 0.8) out.push({ kind: "budget", title: `ניצלת 80% מתקציב ${b.name}`, body: `נותרו ${nis(b.amount - b.spent)} עד סוף החודש.`, link: `/transactions?cat=${b.id}`, dedupeKey: `b80:${b.id}:${month}` });
  }
  if (p.weekly_pace && i.pace.dayOfMonth >= 8 && i.pace.idealToDate > 0) {
    const over = i.pace.spentToDate / i.pace.idealToDate - 1;
    if (over >= 0.22) out.push({ kind: "pace", title: `ההוצאות גבוהות ב-${Math.round(over * 100)}% מהקצב הרגיל`, body: "כדאי להאט קצת כדי לסיים את החודש בתוך היעד.", link: "/", dedupeKey: `pace:${wk}` });
  }
  if (p.weekly_left && i.remainingWeek > 0) {
    out.push({ kind: "week", title: `נשארו לך ${nis(i.remainingWeek)} להוציא השבוע`, link: "/", dedupeKey: `wk:${wk}` });
  }
  for (const a of i.alerts) {
    if (a.kind === "price_increase" && p.price_change) out.push({ kind: "price", title: alertText(a).text, link: "/recurring", dedupeKey: `price:${a.merchant}:${a.to}` });
    if (a.kind === "new" && p.new_recurring) out.push({ kind: "recurring", title: alertText(a).text, link: "/recurring", dedupeKey: `new:${a.merchant}` });
  }
  return out;
}
