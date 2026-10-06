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
