import { describe, expect, it } from "vitest";
import { band, classify } from "../pipeline";
import { indexRules, learnFromCorrection, type LearnedRule } from "../memory";
import { parseQuick } from "../quick-parse";

const none = indexRules([]);
const run = (description: string, extra: Partial<Parameters<typeof classify>[0]> = {}) =>
  classify({ description, amount: 5000, rules: none, ...extra });

describe("parseQuick", () => {
  it.each([
    ["קפה 18", "קפה", 1800],
    ["סלמון 62", "סלמון", 6200],
    ["וולט 84", "וולט", 8400],
    ["דלק 280", "דלק", 28000],
    ["חולצה זארה 149", "חולצה זארה", 14900],
    ["סופר 214.50", "סופר", 21450],
    ["62 סלמון", "סלמון", 6200],
    ["קפה 18 ₪", "קפה", 1800],
    ["סופר 1,250", "סופר", 125000],
  ])("%s", (raw, d, a) => { expect(parseQuick(raw)).toMatchObject({ description: d, amount: a }); });
  it("handles missing amount and yesterday", () => {
    expect(parseQuick("קפה").amount).toBeNull();
    expect(parseQuick("וולט 84 אתמול")).toMatchObject({ description: "וולט", amount: 8400, dateOffsetDays: -1 });
  });
});

describe("classification", () => {
  it("salmon → fish / groceries / household, product remembered", () => {
    const c = run("סלמון");
    expect(c).toMatchObject({ productName: "סלמון", subcategoryId: "s_fish", categoryId: "c_groceries", parentCategoryId: "p_household" });
    expect(band(c.confidence)).toBe("auto");
  });
  it("coffee → eating out / food & dining", () => {
    expect(run("קפה הפוך")).toMatchObject({ subcategoryId: "s_coffee", parentCategoryId: "p_food", consumptionType: "lifestyle" });
  });
  it("t-shirt at Zara → clothing, very confident", () => {
    const c = run("חולצה זארה");
    expect(c).toMatchObject({ subcategoryId: "s_clothing", merchantName: "זארה" });
    expect(c.confidence).toBeGreaterThanOrEqual(0.95);
  });
  it("Wolt is delivery; rent is fixed; investments are not consumption", () => {
    expect(run("וולט")).toMatchObject({ subcategoryId: "s_delivery" });
    expect(run("שכר דירה")).toMatchObject({ consumptionType: "fixed" });
    expect(run("הפקדה להשקעות")).toMatchObject({ financialType: "investment", consumptionType: null });
    expect(run("", { merchant: "ויזה כאל" })).toMatchObject({ financialType: "transfer" });
  });
  it("a card statement is a transfer even though its text contains 'כרטיס' (regression: was counted as cinema)", () => {
    const c = run("ויזה כאל - חיוב כרטיס אשראי", { merchant: "ויזה כאל" });
    expect(c).toMatchObject({ financialType: "transfer", subcategoryId: "s_card_bill" });
    expect(c.consumptionType).toBeNull();
  });
  it("salary and broker deposits are never expenses", () => {
    expect(run("אקסלנס - הפקדה להשקעות", { merchant: "אקסלנס" }).financialType).toBe("investment");
  });
  it("unknown text goes to the review queue", () => {
    const c = run("xyzzy blorp");
    expect(band(c.confidence)).toBe("review");
  });
  it("big unknown purchase is a one-off", () => {
    expect(run("blorp", { amount: 450_000 }).consumptionType).toBe("one_off");
  });
  it("explains itself", () => { expect(run("סלמון").reason).toContain("סלמון"); });
});

describe("learning from corrections", () => {
  it("AM corrected to Groceries sticks (and outranks the dictionary)", () => {
    const first = run("", { merchant: "AM:PM" });
    expect(first.merchantName).toBe("AM:PM");
    const rules: LearnedRule[] = learnFromCorrection([], { merchant: "AM:PM", description: "AM:PM", subcategoryId: "s_shopping_other" });
    const wrong = classify({ description: "", merchant: "AM:PM", amount: 1000, rules: indexRules(rules) });
    expect(wrong.subcategoryId).toBe("s_shopping_other");
    expect(wrong.source).toBe("user_rule");
    const fixed = learnFromCorrection(rules, { merchant: "AM:PM", description: "AM:PM", subcategoryId: "s_grocery_general" });
    const next = classify({ description: "", merchant: "AM:PM", amount: 1000, rules: indexRules(fixed) });
    expect(next.categoryId).toBe("c_groceries");
    expect(band(next.confidence)).toBe("auto");
  });
  it("custom description mapping is remembered", () => {
    const rules = learnFromCorrection([], { description: "ארוחת בוקר דליה", subcategoryId: "s_restaurant" });
    const c = classify({ description: "ארוחת בוקר דליה", amount: 5000, rules: indexRules(rules) });
    expect(c.subcategoryId).toBe("s_restaurant");
  });
  it("repeat confirmations raise weight", () => {
    const r1 = learnFromCorrection([], { description: "x y", subcategoryId: "s_gym" });
    const r2 = learnFromCorrection(r1, { description: "x y", subcategoryId: "s_gym" });
    expect(r2[0].weight).toBe(2);
  });
  it("history of an unknown merchant informs the guess", () => {
    const history = [1, 2, 3].map(() => ({ merchantNormalized: "מאפיית דוד", subcategoryId: "s_bakery", date: "2026-08-01" }));
    const c = classify({ description: "", merchant: "מאפיית דוד", amount: 2000, rules: none, history });
    expect(c.subcategoryId).toBe("s_bakery");
    expect(c.source).toBe("history");
  });
});
