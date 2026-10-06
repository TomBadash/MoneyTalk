import { describe, expect, it, beforeAll } from "vitest";
import { analyze, applyDrill, comparePeriod, resolvePeriod, savingsByMonth } from "../analytics";
import { buildDemoRepo } from "@/db/demo";
import type { Txn } from "@/domain/types";

const today = "2026-10-06";
describe("periods", () => {
  it("resolves ranges", () => {
    expect(resolvePeriod("week", today)).toMatchObject({ from: "2026-10-04", to: today }); // Sunday
    expect(resolvePeriod("month", today).from).toBe("2026-10-01");
    expect(resolvePeriod("quarter", today).from).toBe("2026-10-01");
    expect(resolvePeriod("half", today).from).toBe("2026-07-01");
    expect(resolvePeriod("ytd", today).from).toBe("2026-01-01");
    expect(resolvePeriod("year", today).from).toBe("2025-10-07");
    expect(resolvePeriod("custom", today, "2026-03-10", "2026-03-01")).toMatchObject({ from: "2026-03-01", to: "2026-03-10" });
  });
  it("compares like-for-like", () => {
    const p = resolvePeriod("month", today);
    expect(comparePeriod(p, "prev")).toEqual({ from: "2026-09-25", to: "2026-09-30" });
    expect(comparePeriod(p, "month")).toEqual({ from: "2026-09-01", to: "2026-09-06" });
    expect(comparePeriod(p, "year")).toEqual({ from: "2025-10-01", to: "2025-10-06" });
  });
});

let all: Txn[] = [];
let names = new Map<string, string>();
beforeAll(async () => { const r = await buildDemoRepo(today); all = await r.txns(); names = new Map((await r.products()).map((p) => [p.id, p.name])); });

describe("analysis on demo data", () => {
  const run = (o: Partial<Parameters<typeof analyze>[1]> = {}) => analyze(all, { period: resolvePeriod("year", today), compare: null, basis: "cash", drill: {}, productName: (id) => names.get(id) ?? id, ...o });
  it("totals reconcile with the buckets and the breakdowns (every number traceable)", () => {
    const a = run();
    expect(a.buckets.reduce((s, b) => s + b.total, 0)).toBe(a.total);
    expect(a.categories.reduce((s, r) => s + r.value, 0)).toBe(a.total);
    expect(a.split.fixed + a.split.variable + a.split.oneOff).toBe(a.total);
    expect(a.matching.reduce((s, t) => s + t.amount, 0)).toBe(a.total);
    expect(a.granularity).toBe("month");
  });
  it("drills category → subcategory → product, and totals shrink consistently", () => {
    const top = run().categories[0];
    const d1 = run({ drill: { cat: top.key } });
    expect(d1.total).toBe(top.value);
    const sub = d1.categories[0];
    expect(sub.key).not.toBe(top.key); // now showing subcategories
    expect(run({ drill: { cat: sub.key } }).total).toBe(sub.value);
    const coffee = run({ drill: { cat: "s_coffee" } });
    expect(coffee.products.length).toBeGreaterThan(0);
    expect(coffee.matching.every((t) => t.subcategoryId === "s_coffee")).toBe(true);
  });
  it("purchase basis books installments at purchase time", () => {
    const cash = run({ period: resolvePeriod("year", today), drill: { cat: "s_electronics" } });
    const purchase = run({ period: resolvePeriod("year", today), drill: { cat: "s_electronics" }, basis: "purchase" });
    expect(purchase.total).toBe(600_000); // ₪6,000 laptop at first installment
    expect(cash.total).toBeLessThan(purchase.total + 1); // only the installments paid so far
    expect(cash.total).toBe(400_000); // 4 of 6 installments billed so far
  });
  it("refuses a misleading comparison when history does not cover the earlier window", () => {
    const a = run({ period: resolvePeriod("year", today), compare: "year" });
    expect(a.compareUnavailable).toBe(true);
    expect(a.change).toBeNull();
  });
  it("comparison change", () => {
    const a = run({ period: resolvePeriod("month", today), compare: "month" });
    expect(a.prevTotal).not.toBeNull();
    expect(a.change).toBeCloseTo(a.total / a.prevTotal! - 1, 5);
  });
  it("savings: investments are not spending", () => {
    const s = savingsByMonth(all, "2026-09", 6);
    expect(s).toHaveLength(6);
    const m = s.at(-1)!;
    expect(m.income).toBe(2_150_000);
    expect(m.invested).toBe(550_000);
    expect(m.saved).toBe(m.income - m.spent);
  });
  it("applyDrill by merchant", () => {
    expect(applyDrill(all.filter((t) => t.financialType === "expense"), { merchant: "וולט" }).every((t) => t.merchantNormalized === "וולט")).toBe(true);
  });
});

import { buildMonthlyReport } from "../report";
describe("monthly report", () => {
  it("reconciles with the underlying transactions", () => {
    const r = buildMonthlyReport(all, "2026-09");
    const sept = all.filter((t) => t.date.startsWith("2026-09") && t.financialType === "expense");
    expect(r.total).toBe(sept.reduce((s, t) => s + t.amount, 0));
    expect(r.fixed + r.variable + r.oneOff).toBe(r.total);
    expect(r.saved).toBe(r.income - r.total);
    expect(r.savingsRate).toBeCloseTo(r.saved / r.income, 6);
    expect(r.largestCategory).not.toBeNull();
    expect(r.insights.length).toBeLessThanOrEqual(5);
  });
});
