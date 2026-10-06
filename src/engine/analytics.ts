import type { Agorot, IsoDate, Txn } from "@/domain/types";
import { isConsumption } from "./consumption";
import { pctChange } from "./money";

export type Group = { key: string; total: Agorot; count: number };

export function groupBy(ts: Txn[], keyOf: (t: Txn) => string | null | undefined): Group[] {
  const m = new Map<string, Group>();
  for (const t of ts) {
    if (!isConsumption(t)) continue;
    const k = keyOf(t) ?? "—";
    const g = m.get(k) ?? { key: k, total: 0, count: 0 };
    g.total += t.amount; g.count++;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export function totalsByMonth(ts: Txn[]): Map<string, Agorot> {
  const m = new Map<string, Agorot>();
  for (const t of ts) if (isConsumption(t)) m.set(t.date.slice(0, 7), (m.get(t.date.slice(0, 7)) ?? 0) + t.amount);
  return m;
}

export type Compare = { current: Agorot; previous: Agorot; change: number | null };
export function compare(current: Txn[], previous: Txn[]): Compare {
  const c = current.filter(isConsumption).reduce((s, t) => s + t.amount, 0);
  const p = previous.filter(isConsumption).reduce((s, t) => s + t.amount, 0);
  return { current: c, previous: p, change: pctChange(c, p) };
}

export type ProductStat = {
  productId: string; count: number; total: Agorot; avg: Agorot; min: Agorot; max: Agorot;
  last: Agorot; first: IsoDate; lastDate: IsoDate; priceChange: number | null;
};

/** Product memory stats; priceChange = avg of last 3 purchases vs avg of first 3 (needs ≥4 purchases). */
export function productStats(ts: Txn[]): ProductStat[] {
  const m = new Map<string, Txn[]>();
  for (const t of ts) if (t.productId && isConsumption(t)) (m.get(t.productId) ?? m.set(t.productId, []).get(t.productId)!).push(t);
  return [...m.entries()].map(([productId, list]) => {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const amts = list.map((t) => t.amount);
    const total = amts.reduce((s, x) => s + x, 0);
    const avg3 = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const priceChange = list.length >= 4 ? pctChange(avg3(amts.slice(-3)), avg3(amts.slice(0, 3))) : null;
    return {
      productId, count: list.length, total, avg: Math.round(total / list.length),
      min: Math.min(...amts), max: Math.max(...amts), last: amts[amts.length - 1],
      first: list[0].date, lastDate: list[list.length - 1].date, priceChange,
    };
  });
}

export type MerchantStat = { key: string; name: string; total: Agorot; count: number; avg: Agorot; last: IsoDate; first: IsoDate };
export function merchantStats(ts: Txn[]): MerchantStat[] {
  const m = new Map<string, MerchantStat>();
  for (const t of ts) {
    if (!isConsumption(t) || !t.merchantNormalized) continue;
    const s = m.get(t.merchantNormalized) ?? { key: t.merchantNormalized, name: t.merchantRaw || t.merchantNormalized, total: 0, count: 0, avg: 0, last: t.date, first: t.date };
    s.total += t.amount; s.count++;
    if (t.date > s.last) s.last = t.date;
    if (t.date < s.first) s.first = t.date;
    m.set(t.merchantNormalized, s);
  }
  return [...m.values()].map((s) => ({ ...s, avg: Math.round(s.total / s.count) })).sort((a, b) => b.total - a.total);
}

export type MonthPoint = { key: string; total: Agorot; fixed: Agorot; variable: Agorot; oneOff: Agorot };
/** Consumption per calendar month for the `months` months ending at `endMonth` (YYYY-MM), zero-filled. */
export function monthlySeries(ts: Txn[], endMonth: string, months: number): MonthPoint[] {
  const out = new Map<string, MonthPoint>();
  const [y, m] = endMonth.split("-").map(Number);
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    const key = d.toISOString().slice(0, 7);
    out.set(key, { key, total: 0, fixed: 0, variable: 0, oneOff: 0 });
  }
  for (const t of ts) {
    if (!isConsumption(t)) continue;
    const p = out.get(t.date.slice(0, 7));
    if (!p) continue;
    p.total += t.amount;
    if (t.consumptionType === "fixed") p.fixed += t.amount;
    else if (t.consumptionType === "one_off") p.oneOff += t.amount;
    else p.variable += t.amount;
  }
  return [...out.values()];
}
