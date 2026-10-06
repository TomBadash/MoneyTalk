import type { Agorot, Interval, IsoDate, RecurringRule, Txn } from "@/domain/types";
import { addDays, addMonths, diffDays, monthKey } from "./period";

const BANDS: { interval: Interval; min: number; max: number; days: number }[] = [
  { interval: "weekly", min: 6, max: 8, days: 7 },
  { interval: "monthly", min: 27, max: 34, days: 30 },
  { interval: "bimonthly", min: 55, max: 67, days: 61 },
  { interval: "quarterly", min: 85, max: 97, days: 91 },
  { interval: "yearly", min: 350, max: 380, days: 365 },
];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export function nextDate(last: IsoDate, interval: Interval): IsoDate {
  switch (interval) {
    case "weekly": return addDays(last, 7);
    case "monthly": return addMonths(last, 1);
    case "bimonthly": return addMonths(last, 2);
    case "quarterly": return addMonths(last, 3);
    case "yearly": return addMonths(last, 12);
  }
}

export type Detected = RecurringRule & { occurrences: number; amountVariable: boolean };

/** Detect recurring expenses from history. Requires ≥3 weekly or ≥2 other occurrences. */
export function detectRecurring(history: Txn[], today: IsoDate): Detected[] {
  const groups = new Map<string, Txn[]>();
  for (const t of history) {
    if (t.financialType !== "expense" || t.transactionType !== "debit") continue;
    const key = t.merchantNormalized;
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  const out: Detected[] = [];
  for (const [merchant, all] of groups) {
    // collapse same-day duplicates
    const ts = [...all].sort((a, b) => a.date.localeCompare(b.date));
    const gaps: number[] = [];
    for (let k = 1; k < ts.length; k++) gaps.push(diffDays(ts[k].date, ts[k - 1].date));
    if (gaps.length < 1) continue;
    const mg = median(gaps);
    const band = BANDS.find((b) => mg >= b.min && mg <= b.max);
    if (!band) continue;
    const ok = gaps.filter((g) => g >= band.min - 2 && g <= band.max + 2).length / gaps.length;
    const needed = band.interval === "weekly" ? 3 : 2;
    if (ts.length < needed || ok < 0.7) continue;
    const amounts = ts.map((t) => t.amount);
    const med = median(amounts);
    const spread = (Math.max(...amounts) - Math.min(...amounts)) / (med || 1);
    // A subscription changes price rarely (a step now and then); a utility changes almost every cycle.
    const changes = amounts.slice(1).filter((a, k) => Math.abs(a - amounts[k]) / (amounts[k] || 1) > 0.03).length;
    const churn = changes / Math.max(1, amounts.length - 1);
    const maxStep = amounts.slice(1).reduce((m, a, k) => Math.max(m, Math.abs(a - amounts[k]) / (amounts[k] || 1)), 0);
    const amountVariable = (changes >= 3 && churn > 0.4) || (amounts.length <= 3 && maxStep > 0.25);
    // Frequent, wildly varying purchases at the same shop (e.g. a supermarket) are habits, not bills.
    if (band.interval === "weekly" && spread > 0.35) continue;
    if (spread > 0.6) continue;
    const last = ts[ts.length - 1];
    out.push({
      id: `det:${merchant}:${band.interval}`,
      merchantNormalized: merchant,
      title: last.merchantRaw || merchant,
      amount: last.amount,
      interval: band.interval,
      dayOfMonth: Number(last.date.slice(8, 10)),
      nextExpected: nextDate(last.date, band.interval),
      lastSeen: last.date,
      active: diffDays(today, last.date) <= band.days * 1.6,
      categoryId: last.categoryId ?? null,
      consumptionType: last.consumptionType ?? "fixed",
      occurrences: ts.length,
      amountVariable,
    });
  }
  return out;
}

export type RecurringAlert =
  | { kind: "price_increase"; merchant: string; from: Agorot; to: Agorot }
  | { kind: "new"; merchant: string; amount: Agorot }
  | { kind: "disappeared"; merchant: string; lastSeen: IsoDate }
  | { kind: "duplicate"; merchant: string; amount: Agorot; month: string }
  | { kind: "unusual_amount"; merchant: string; amount: Agorot; typical: Agorot };

export function recurringAlerts(history: Txn[], rules: Detected[], today: IsoDate): RecurringAlert[] {
  const alerts: RecurringAlert[] = [];
  for (const r of rules) {
    const ts = history
      .filter((t) => t.merchantNormalized === r.merchantNormalized && t.financialType === "expense")
      .sort((a, b) => a.date.localeCompare(b.date));
    if (ts.length < 2) continue;
    const last = ts[ts.length - 1], prev = ts[ts.length - 2];
    const typical = median(ts.slice(0, -1).map((t) => t.amount));
    // most recent step up in a stable price, still fresh (≤ 60 days) — remembered past the next normal charge
    let step: { from: Agorot; to: Agorot } | null = null;
    if (!r.amountVariable) {
      for (let k = ts.length - 1; k >= 1; k--) {
        if (diffDays(today, ts[k].date) > 60) break;
        if (ts[k].amount > ts[k - 1].amount) { step = { from: ts[k - 1].amount, to: ts[k].amount }; break; }
      }
    }
    if (step) {
      alerts.push({ kind: "price_increase", merchant: r.title, ...step });
    } else if (r.amountVariable && last.amount > typical * 1.5 && diffDays(today, last.date) <= 45) {
      alerts.push({ kind: "unusual_amount", merchant: r.title, amount: last.amount, typical });
    }
    if (r.occurrences === 2 && diffDays(today, ts[0].date) <= 75 && r.interval !== "weekly") {
      alerts.push({ kind: "new", merchant: r.title, amount: r.amount });
    }
    const grace = r.interval === "weekly" ? 10 : r.interval === "monthly" ? 12 : 20;
    if (!r.active || diffDays(today, r.nextExpected) > grace) {
      if (r.occurrences >= 3) alerts.push({ kind: "disappeared", merchant: r.title, lastSeen: r.lastSeen });
    }
    // same merchant charged twice in a month with identical amount
    const byMonth = new Map<string, number>();
    for (const t of ts) {
      const k = `${monthKey(t.date)}|${t.amount}`;
      byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
    }
    for (const [k, n] of byMonth) {
      const [m, amt] = k.split("|");
      if (n > 1 && r.interval !== "weekly" && diffDays(today, `${m}-01`) <= 62) {
        alerts.push({ kind: "duplicate", merchant: r.title, amount: Number(amt), month: m });
      }
    }
  }
  return alerts;
}

export type MonthRecurring = { expected: Agorot; paid: Agorot; remaining: Agorot; upcoming: { title: string; amount: Agorot; date: IsoDate }[] };

/** Recurring picture for the month containing `today`: expected / already paid / still expected. */
export function recurringForMonth(rules: RecurringRule[], monthTxns: Txn[], today: IsoDate): MonthRecurring {
  const mk = monthKey(today);
  let expected = 0, paid = 0;
  const upcoming: MonthRecurring["upcoming"] = [];
  for (const r of rules) {
    if (!r.active) continue;
    // project occurrences landing in this month
    let d = r.nextExpected;
    const seen = monthTxns.some((t) => t.merchantNormalized === r.merchantNormalized && monthKey(t.date) === mk);
    if (monthKey(r.lastSeen) === mk) { // already occurred this month
      expected += r.amount; paid += r.amount; continue;
    }
    for (let n = 0; n < 6 && monthKey(d) < mk; n++) d = nextDate(d, r.interval);
    if (monthKey(d) !== mk) continue;
    expected += r.amount;
    if (seen) paid += r.amount;
    else upcoming.push({ title: r.title, amount: r.amount, date: d });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  return { expected, paid, remaining: expected - paid, upcoming };
}
