import { describe, expect, it } from "vitest";
import { parseSearch, matches, paramsToQuery, hrefFor } from "../search";
import type { Txn } from "@/domain/types";

const today = "2026-10-06";
const t = (o: Partial<Txn>): Txn => ({
  id: "1", sourceProvider: "x", date: "2026-09-10", merchantRaw: "וולט", merchantNormalized: "וולט", descriptionRaw: "וולט ת\"א", amount: 8400,
  currency: "ILS", transactionType: "debit", financialType: "expense", recurringStatus: "none", userCorrected: false,
  categoryId: "c_delivery", subcategoryId: "s_delivery", parentCategoryId: "p_food", ...o,
});
const L = { productName: () => "" };

describe("parseSearch", () => {
  it("amounts", () => {
    expect(parseSearch("מעל 500 שקל", today)).toEqual({ min: 50000 });
    expect(parseSearch("מתחת ל-200", today)).toEqual({ max: 20000 });
  });
  it("month with year, month alone, with prefix", () => {
    expect(parseSearch("יולי 2026", today)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(parseSearch("מסעדות בספטמבר", today)).toEqual({ from: "2026-09-01", to: "2026-09-30", text: ["מסעדות"] });
    expect(parseSearch("דצמבר", today).from).toBe("2025-12-01"); // future month → last year
  });
  it("relative periods + text", () => {
    expect(parseSearch("קפה השנה", today)).toEqual({ from: "2026-01-01", to: today, text: ["קפה"] });
    expect(parseSearch("Wolt", today)).toEqual({ text: ["Wolt"] });
  });
});

describe("matches", () => {
  it("finds by merchant in english or hebrew, category names and synonyms", () => {
    expect(matches(t({}), { text: ["wolt"] }, L)).toBe(true);
    expect(matches(t({}), { text: ["וולט"] }, L)).toBe(true);
    expect(matches(t({}), { text: ["משלוחים"] }, L)).toBe(true);
    expect(matches(t({}), { text: ["סופר"] }, L)).toBe(false);
    expect(matches(t({ merchantRaw: "זארה", merchantNormalized: "זארה", categoryId: "c_shopping", subcategoryId: "s_clothing" }), { text: ["בגדים"] }, L)).toBe(true);
  });
  it("applies amount/date filters", () => {
    expect(matches(t({}), parseSearch("מעל 50 שקל ספטמבר", today), L)).toBe(true);
    expect(matches(t({}), parseSearch("מעל 500 שקל", today), L)).toBe(false);
    expect(matches(t({}), parseSearch("אוגוסט", today), L)).toBe(false);
  });
  it("round-trips through the URL", () => {
    const q = parseSearch("קפה מעל 10 יולי 2026", today);
    const href = hrefFor(q);
    const sp = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(paramsToQuery(sp, today)).toMatchObject({ from: "2026-07-01", to: "2026-07-31", min: 1000 });
  });
});
