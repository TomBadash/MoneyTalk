import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/db/memory";
import { MockProvider } from "@/providers/mock";
import { NoopAi, type AiProvider } from "@/ai/provider";
import { runDaily, type JobDeps } from "../daily";
import { isConsumption } from "@/engine/consumption";
import { buildNotifications } from "@/engine/notifications";

const today = "2026-10-06";
const mock = new MockProvider();
const deps = (over: Partial<JobDeps> = {}): JobDeps => ({ ai: new NoopAi(), provider: (id) => (id === "mock" ? mock : undefined), decrypt: (c) => c.replace(/^enc:/, ""), ...over });

async function connected() {
  const repo = new MemoryRepo();
  repo.seed({ profile: { monthlyIncome: 2_150_000, monthlyRent: 650_000, monthlySavingsTarget: 300_000, monthlyInvestmentTarget: 250_000, variableTarget: null, onboarded: true } });
  const c = await mock.completeConnect({ state: "s", params: { consent: "granted" } });
  await repo.createConnection({ provider: "mock", institution: c.institution, accounts: c.accounts.map((a) => ({ ...a, externalId: a.externalId })), tokenCiphertext: `enc:${c.handle.token}` });
  return repo;
}

describe("daily job", () => {
  it("syncs, reconciles, detects and refreshes — and is idempotent", async () => {
    const repo = await connected();
    const r1 = await runDaily(repo, today, deps());
    expect(r1.status).toBe("ok");
    expect(Number(r1.stats.imported)).toBeGreaterThan(300);
    const all = await repo.txns();
    // card statements paid from the bank are not consumption (no double counting)
    expect(all.filter(isConsumption).some((t) => /חיוב כרטיס/.test(t.descriptionRaw))).toBe(false);
    expect((await repo.recurring()).length).toBeGreaterThan(3);
    expect(await repo.snapshot(today)).not.toBeNull();
    expect((await repo.connections())[0]).toMatchObject({ status: "active" });
    expect((await repo.connections())[0].lastSuccessfulSync).toBeTruthy();

    const before = all.length;
    const r2 = await runDaily(repo, today, deps());
    expect(Number(r2.stats.imported)).toBe(0);
    expect((await repo.txns()).length).toBe(before);
    expect((await repo.lastJob())?.status).toBe("ok");
  });

  it("a failing bank marks the connection unhealthy with a human message but the rest still runs", async () => {
    const repo = await connected();
    await runDaily(repo, today, deps());
    const broken = { ...mock, id: "mock", fetchTransactions: async () => { throw new Error("503 upstream"); } } as unknown as MockProvider;
    const r = await runDaily(repo, today, deps({ provider: () => broken }));
    expect(r.stats.sync_failed).toBe(1);
    const c = (await repo.connections())[0];
    expect(c.status).toBe("error");
    expect(c.lastError).toContain("הנתונים האחרונים שלך עדיין שמורים");
    expect(await repo.snapshot(today)).not.toBeNull(); // dashboard still refreshed
    expect(r.status).toBe("ok");
  });

  it("an AI outage is isolated (partial), never fatal", async () => {
    const repo = await connected();
    const boom: AiProvider = { name: "x", available: true, classify: async () => { throw new Error("overloaded"); }, toQuerySpec: async () => null };
    const r = await runDaily(repo, today, deps({ ai: boom }));
    expect(r.status).toBe("partial");
    expect(r.stats.ai_error).toBeDefined();
    expect(await repo.snapshot(today)).not.toBeNull();
  });

  it("model suggestions only fill the review queue, capped below auto-approve", async () => {
    const repo = await connected();
    const ai: AiProvider = { name: "fake", available: true, toQuerySpec: async () => null,
      classify: async (items) => items.map((i) => ({ id: i.id, subcategoryId: "s_grocery_general", confidence: 0.97, reason: "נראה כמו מכולת" })) };
    await runDaily(repo, today, deps());
    const reviewBefore = (await repo.txns({ needsReview: true })).length;
    expect(reviewBefore).toBeGreaterThan(0);
    const r = await runDaily(repo, today, deps({ ai }));
    expect(Number(r.stats.ai_updated)).toBe(reviewBefore);
    const updated = (await repo.txns()).filter((t) => t.aiClassificationVersion === "llm:fake");
    expect(updated.length).toBe(reviewBefore);
    expect(updated.every((t) => (t.aiConfidence ?? 1) <= 0.89 && !t.userCorrected)).toBe(true);
  });
});

describe("notifications", () => {
  const base = { today, categoryBudgets: [{ id: "c_eating_out", name: "מסעדות", amount: 90_000, spent: 75_000 }], pace: { spentToDate: 500_000, idealToDate: 400_000, dayOfMonth: 10 }, remainingWeek: 62_000, alerts: [] };
  it("fires useful items once, honours preferences", () => {
    const n = buildNotifications(base);
    expect(n.map((x) => x.title)).toEqual(expect.arrayContaining(["ניצלת 80% מתקציב מסעדות", "ההוצאות גבוהות ב-25% מהקצב הרגיל", "נשארו לך ₪620 להוציא השבוע"]));
    expect(new Set(n.map((x) => x.dedupeKey)).size).toBe(n.length);
    expect(buildNotifications({ ...base, prefs: { budget_80: false, weekly_pace: false, weekly_left: false } })).toEqual([]);
  });
  it("is quiet when things are fine", () => {
    expect(buildNotifications({ ...base, categoryBudgets: [{ ...base.categoryBudgets[0], spent: 10_000 }], pace: { spentToDate: 100, idealToDate: 400_000, dayOfMonth: 10 }, remainingWeek: 0 })).toEqual([]);
  });
});
