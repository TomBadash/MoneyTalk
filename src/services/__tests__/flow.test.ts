import { beforeAll, describe, expect, it } from "vitest";
import { buildDemoRepo } from "@/db/demo";
import type { MemoryRepo } from "@/db/memory";
import { computeDashboard } from "../dashboard";
import { quickAdd, ingestDrafts } from "../ingest";
import { approveClassification, correctTransaction } from "../correct";
import { isConsumption } from "@/engine/consumption";
import { productStats } from "@/engine/analytics";
import { band } from "@/classify/pipeline";

const TODAY = "2026-10-06";
let repo: MemoryRepo;
beforeAll(async () => { repo = await buildDemoRepo(TODAY); });

describe("demo data through the real pipeline", () => {
  it("auto-categorises the overwhelming majority", async () => {
    const all = await repo.txns();
    const confident = all.filter((t) => (t.aiConfidence ?? 0) >= 0.7).length;
    expect(confident / all.length).toBeGreaterThan(0.97);
    expect(all.filter((t) => t.needsReview).length).toBeLessThanOrEqual(4);
  });
  it("never counts card statements, savings, investments or salary as spending", async () => {
    const all = await repo.txns();
    const spend = all.filter(isConsumption);
    expect(spend.some((t) => /חיוב כרטיס/.test(t.descriptionRaw))).toBe(false);
    expect(spend.some((t) => ["savings", "investment", "income", "transfer"].includes(t.financialType))).toBe(false);
    expect(all.filter((t) => t.financialType === "transfer").length).toBeGreaterThanOrEqual(10);
    expect(all.some((t) => t.financialType === "investment")).toBe(true);
  });
  it("builds a coherent dashboard", async () => {
    const d = await computeDashboard(repo, TODAY, true);
    expect(d.hasData).toBe(true);
    expect(d.monthTarget).toBe(550_000);
    expect(d.remainingMonth).toBe(d.monthTarget - d.spentVariable);
    expect(d.spentMonth).toBeGreaterThanOrEqual(d.spentVariable);
    expect(d.insights.length).toBeLessThanOrEqual(3);
    expect(d.upcoming.length).toBeGreaterThan(0);
    expect(d.upcoming.every((u) => u.date >= TODAY)).toBe(true);
    expect(d.forecast.savings).toBeGreaterThan(0);
    expect(d.pace.points.at(-1)!.ideal).toBe(d.monthTarget);
    expect(d.categories.length).toBeGreaterThan(0);
  });
  it("remembers products with their stats", async () => {
    const [products, all] = await Promise.all([repo.products(), repo.txns()]);
    const salmon = products.find((p) => p.name === "סלמון")!;
    const s = productStats(all).find((x) => x.productId === salmon.id)!;
    expect(s.count).toBeGreaterThan(20);
    expect(s.priceChange).toBeGreaterThan(0.05); // price crept up over the year
    expect(s.min).toBeLessThanOrEqual(s.avg);
    expect(s.max).toBeGreaterThanOrEqual(s.avg);
  });
});

describe("quick add", () => {
  it("'קפה 18' is saved, classified and moves today's numbers", async () => {
    const before = await computeDashboard(repo, TODAY, true);
    const r = await quickAdd(repo, "קפה 18", TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created.txn).toMatchObject({ amount: 1800, subcategoryId: "s_coffee", date: TODAY, financialType: "expense" });
    expect(band(r.created.classification.confidence)).toBe("auto");
    expect(r.created.txn.productId).toBeTruthy();
    const after = await computeDashboard(repo, TODAY, true);
    expect(after.spentVariable - before.spentVariable).toBe(1800);
    expect(after.remainingMonth - before.remainingMonth).toBe(-1800);
  });
  it("rejects missing amounts with a human message", async () => {
    const r = await quickAdd(repo, "קפה", TODAY);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("סכום") });
  });
  it("handles 'חולצה זארה 149' end to end", async () => {
    const r = await quickAdd(repo, "חולצה זארה 149", TODAY);
    expect(r.ok && r.created.txn.subcategoryId).toBe("s_clothing");
  });
});

describe("learning", () => {
  it("one correction fixes look-alikes and the next import", async () => {
    const [bad] = await ingestDrafts(repo, [
      { description: "מסעדת הדסה", merchant: "מסעדת הדסה", amount: 15_000, date: TODAY, source: "demo", externalId: "x-1", accountId: "demo-card" },
      { description: "מסעדת הדסה", merchant: "מסעדת הדסה", amount: 12_000, date: "2026-10-05", source: "demo", externalId: "x-2", accountId: "demo-card" },
    ], TODAY);
    // user decides this place is actually a bar
    const res = await correctTransaction(repo, bad.txn.id, "s_bars", TODAY);
    expect(res.updated).toBeGreaterThanOrEqual(2);
    const [next] = await ingestDrafts(repo, [{ description: "מסעדת הדסה", merchant: "מסעדת הדסה", amount: 9_000, date: TODAY, source: "demo", externalId: "x-3", accountId: "demo-card" }], TODAY);
    expect(next.txn.subcategoryId).toBe("s_bars");
    expect(next.classification.source).toBe("user_rule");
    expect(band(next.classification.confidence)).toBe("auto");
  });
  it("unknown merchants go to review; one tap approves and remembers", async () => {
    const [u] = await ingestDrafts(repo, [{ description: "קיוסק חדש", merchant: "קיוסק חדש", amount: 2_000, date: TODAY, source: "demo", externalId: "y-1", accountId: "demo-card" }], TODAY);
    expect(u.txn.needsReview).toBe(true);
    await correctTransaction(repo, u.txn.id, "s_grocery_general", TODAY);
    const [again] = await ingestDrafts(repo, [{ description: "קיוסק חדש", merchant: "קיוסק חדש", amount: 2_500, date: TODAY, source: "demo", externalId: "y-2", accountId: "demo-card" }], TODAY);
    expect(again.txn.needsReview).toBe(false);
    expect(again.txn.categoryId).toBe("c_groceries");
    await approveClassification(repo, again.txn.id);
  });
  it("re-importing the same bank rows creates nothing (dedupe)", async () => {
    const d = { description: "וולט", merchant: "וולט", amount: 7_700, date: TODAY, source: "demo", externalId: "z-1", accountId: "demo-card" };
    expect(await ingestDrafts(repo, [d], TODAY)).toHaveLength(1);
    expect(await ingestDrafts(repo, [d], TODAY)).toHaveLength(0);
  });
});

import { ensureSuggestions } from "../suggestions";
describe("monthly budget suggestion → approve", () => {
  it("is offered once, never changes the budget silently, and applies only when approved", async () => {
    const r = await buildDemoRepo(TODAY);
    await r.setBudget("c_eating_out", 50_000, "user"); // user set ₪500; they actually spend ~₪900
    await ensureSuggestions(r, TODAY);
    const pending = await r.suggestions("pending");
    const s = pending.find((x) => x.categoryId === "c_eating_out")!;
    expect(s).toBeDefined();
    const p = s.payload as { suggested: number; current: number; avg: number };
    expect(p.current).toBe(50_000);
    expect(p.suggested).toBeGreaterThan(p.current);          // nudged toward reality…
    expect(p.suggested).toBeLessThan(p.avg);                  // …but only halfway (gradual)
    expect((await r.budgets()).find((b) => b.categoryId === "c_eating_out")!.amount).toBe(50_000); // untouched until approved
    // approve
    await r.setBudget("c_eating_out", p.suggested, "suggestion_approved");
    await r.resolveSuggestion(s.id, "approved");
    expect((await r.budgets()).find((b) => b.categoryId === "c_eating_out")!.amount).toBe(p.suggested);
    // not re-offered for the same period, even after approval
    await ensureSuggestions(r, TODAY);
    expect((await r.suggestions("pending")).some((x) => x.categoryId === "c_eating_out")).toBe(false);
  });
});
