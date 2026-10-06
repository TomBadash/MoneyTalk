import { describe, expect, it } from "vitest";
import type { Profile, Txn } from "@/domain/types";
import { allocate, toAgorot } from "../money";
import { computeSafeToSpend, learnDayWeights } from "../safe-to-spend";
import { computeForecast } from "../forecast";
import { detectRecurring, recurringAlerts, recurringForMonth } from "../recurring";
import { filterNew } from "../dedupe";
import { detectCardBillPayments } from "../reconcile";
import { installmentPlans, purchaseBasisAmount } from "../installments";
import { isConsumption } from "../consumption";
import { suggestCategoryBudget } from "../budgets";
import { eachDay, isWeekend } from "../period";

let n = 0;
const tx = (o: Partial<Txn>): Txn => ({
  id: `t${n++}`, sourceProvider: "test", date: "2026-09-01", merchantRaw: "x", merchantNormalized: "x",
  descriptionRaw: "x", amount: 1000, currency: "ILS", transactionType: "debit", financialType: "expense",
  recurringStatus: "none", userCorrected: false, ...o,
});
const profile: Profile = { monthlyIncome: 2_000_000, monthlyRent: 650_000, monthlySavingsTarget: 500_000, monthlyInvestmentTarget: 200_000 };

describe("money", () => {
  it("rounds to agorot", () => { expect(toAgorot(214.5)).toBe(21450); expect(toAgorot(0.1 + 0.2)).toBe(30); });
  it("allocate sums exactly", () => {
    const a = allocate(10_001, [1, 1, 1, 1.5, 2]);
    expect(a.reduce((s, x) => s + x, 0)).toBe(10_001);
  });
});

describe("consumption", () => {
  it("excludes savings/investments/transfers/income", () => {
    for (const f of ["savings", "investment", "transfer", "income"] as const)
      expect(isConsumption(tx({ financialType: f }))).toBe(false);
    expect(isConsumption(tx({}))).toBe(true);
  });
});

describe("safe to spend", () => {
  const today = "2026-09-10"; // Thursday
  const uniform = { weekday: 1, weekend: 1 };
  it("derives the variable target from the income model", () => {
    const r = computeSafeToSpend({ today, profile, fixedMonth: 800_000, variableByDay: new Map(), weights: uniform });
    expect(r.monthTarget).toBe(2_000_000 - 800_000 - 500_000 - 200_000);
    expect(r.derived).toBe(true);
  });
  it("re-spreads the remaining month after overspending", () => {
    const p = { ...profile, variableTarget: 450_000 };
    const calm = computeSafeToSpend({ today, profile: p, fixedMonth: 0, variableByDay: new Map([["2026-09-05", 100_000]]), weights: uniform });
    const over = computeSafeToSpend({ today, profile: p, fixedMonth: 0, variableByDay: new Map([["2026-09-05", 250_000]]), weights: uniform });
    expect(over.remainingMonth).toBe(200_000);
    expect(over.remainingWeek).toBeLessThan(calm.remainingWeek);
    expect(over.status).toBe("over");
  });
  it("shows the deficit when over target", () => {
    const p = { ...profile, variableTarget: 100_000 };
    const r = computeSafeToSpend({ today, profile: p, fixedMonth: 0, variableByDay: new Map([["2026-09-02", 150_000]]), weights: uniform });
    expect(r.remainingMonth).toBe(-50_000);
    expect(r.remainingWeek).toBe(-50_000);
  });
  it("weekly allowance covers only days left in the (Sun–Sat) week", () => {
    const p = { ...profile, variableTarget: 300_000 };
    const r = computeSafeToSpend({ today, profile: p, fixedMonth: 0, variableByDay: new Map(), weights: uniform });
    // Thu..Sat = 3 days of the 21 remaining (Sep 10..30)
    expect(Math.abs(r.remainingWeek - (300_000 * 3) / 21)).toBeLessThanOrEqual(3);
  });
  it("ideal pace ends at the target", () => {
    const p = { ...profile, variableTarget: 300_000 };
    const r = computeSafeToSpend({ today, profile: p, fixedMonth: 0, variableByDay: new Map(), weights: uniform });
    expect(r.pace.at(-1)!.ideal).toBe(300_000);
  });
  it("learns weekend weighting only with 4+ weeks of history", () => {
    expect(learnDayWeights([tx({ date: "2026-09-08", categoryId: "c_x" })], today)).toEqual(uniform);
    const hist: Txn[] = eachDay("2026-06-01", "2026-09-09").map((d) =>
      tx({ date: d, amount: isWeekend(d) ? 20_000 : 10_000, consumptionType: "lifestyle" }));
    expect(learnDayWeights(hist, today).weekend).toBeCloseTo(2, 1);
  });
});

describe("forecast", () => {
  it("projects month-end and flags variance + confidence", () => {
    const f = computeForecast({
      today: "2026-09-15", profile, weights: { weekday: 1, weekend: 1 }, variableSpent: 150_000,
      historicalDaily: 10_000, historyDays: 120, fixedPaid: 700_000, fixedExpected: 100_000,
      oneOffSoFar: 0, variableTarget: 250_000,
    });
    expect(f.variableSpending).toBe(300_000);
    expect(f.budgetVariance).toBe(50_000);
    expect(f.savings).toBe(2_000_000 - (300_000 + 800_000));
    expect(f.confidence).toBe("high");
  });
  it("low confidence without history", () => {
    const f = computeForecast({ today: "2026-09-05", profile, weights: { weekday: 1, weekend: 1 }, variableSpent: 10_000, historicalDaily: 0, historyDays: 5, fixedPaid: 0, fixedExpected: 0, oneOffSoFar: 0, variableTarget: 100_000 });
    expect(f.confidence).toBe("low");
  });
});

describe("recurring", () => {
  const monthly = (m: string, merchant: string, amounts: number[], day = "05") =>
    amounts.map((a, k) => tx({ merchantNormalized: m, merchantRaw: merchant, date: `2026-0${6 + k}-${day}`, amount: a }));
  it("detects monthly subscription and a price increase", () => {
    const h = monthly("spotify", "Spotify", [1990, 1990, 2190]);
    const d = detectRecurring(h, "2026-08-20");
    expect(d).toHaveLength(1);
    expect(d[0].interval).toBe("monthly");
    expect(d[0].nextExpected).toBe("2026-09-05");
    const alerts = recurringAlerts(h, d, "2026-08-20");
    expect(alerts.find((a) => a.kind === "price_increase")).toMatchObject({ from: 1990, to: 2190 });
  });
  it("ignores irregular supermarket habit", () => {
    const h = [3, 9, 12, 20, 29].map((d, k) => tx({ merchantNormalized: "שופרסל", date: `2026-08-${String(d).padStart(2, "0")}`, amount: 10_000 + k * 9000 }));
    expect(detectRecurring(h, "2026-09-01")).toHaveLength(0);
  });
  it("detects quarterly and yearly", () => {
    const q = ["2026-01-10", "2026-04-10", "2026-07-10"].map((date) => tx({ merchantNormalized: "ארנונה", date, amount: 90_000 }));
    expect(detectRecurring(q, "2026-08-01")[0].interval).toBe("quarterly");
    const y = ["2024-03-01", "2025-03-01"].map((date) => tx({ merchantNormalized: "ביטוח", date, amount: 300_000 }));
    expect(detectRecurring(y, "2025-06-01")[0].interval).toBe("yearly");
  });
  it("flags a disappeared subscription", () => {
    const h = [ "2026-03-05","2026-04-05","2026-05-05"].map((date) => tx({ merchantNormalized: "netflix", merchantRaw: "Netflix", date, amount: 4990 }));
    const d = detectRecurring(h, "2026-09-01");
    expect(recurringAlerts(h, d, "2026-09-01").some((a) => a.kind === "disappeared")).toBe(true);
  });
  it("splits month into paid and still expected", () => {
    const h = monthly("rent", "שכר דירה", [650_000, 650_000, 650_000, 650_000], "01");
    const spot = monthly("spotify", "Spotify", [1990, 1990, 1990], "20");
    const rules = detectRecurring([...h, ...spot], "2026-09-10");
    const monthTxns = [...h, ...spot].filter((t) => t.date.startsWith("2026-09"));
    const r = recurringForMonth(rules, monthTxns, "2026-09-10");
    expect(r.paid).toBe(650_000);
    expect(r.remaining).toBe(1990);
    expect(r.upcoming[0].title).toBe("Spotify");
  });
});

describe("dedupe / reconcile / installments", () => {
  it("dedupes by external id and composite key", () => {
    const a = tx({ externalId: "e1", accountId: "acc" });
    expect(filterNew([a], [tx({ externalId: "e1", accountId: "acc" }), tx({ externalId: "e2", accountId: "acc" })])).toHaveLength(1);
    const m = tx({ merchantNormalized: "קפה", amount: 1800 });
    expect(filterNew([m], [tx({ merchantNormalized: "קפה", amount: 1800 })])).toHaveLength(0);
  });
  it("marks card-bill debits as transfers when card txns exist", () => {
    const card = [3000, 4000, 5000].map((a, k) => tx({ date: `2026-08-0${k + 2}`, amount: a, accountId: "card" }));
    const bill = tx({ date: "2026-09-02", amount: 12_000, merchantRaw: "ישראכרט", accountId: "bank" });
    expect(detectCardBillPayments([bill], card)).toEqual([bill.id]);
    expect(detectCardBillPayments([bill], [])).toEqual([]);
  });
  it("installments", () => {
    const ts = [1, 2, 3].map((k) => tx({ merchantNormalized: "ksp", amount: 100_000, installmentNumber: k, installmentTotal: 6 }));
    expect(installmentPlans(ts)).toEqual([{ merchant: "ksp", total: 600_000, monthly: 100_000, paid: 3, remaining: 3, lastDate: "2026-09-01" }]);
    expect(purchaseBasisAmount(ts[0])).toBe(600_000);
    expect(purchaseBasisAmount(ts[1])).toBe(0);
  });
});

describe("budget suggestions", () => {
  it("nudges halfway toward observed behaviour, never silently", () => {
    const h = ["2026-05", "2026-06", "2026-07", "2026-08"].map((m) => tx({ categoryId: "c_eating_out", date: `${m}-10`, amount: 92_000 }));
    const s = suggestCategoryBudget("c_eating_out", h, 70_000, "2026-09-03")!;
    expect(s.avg4m).toBe(92_000);
    expect(s.suggested).toBe(81_000);
  });
  it("needs history", () => {
    expect(suggestCategoryBudget("c_eating_out", [], null, "2026-09-03")).toBeNull();
  });
});
