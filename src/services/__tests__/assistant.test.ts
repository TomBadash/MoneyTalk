import { beforeAll, describe, expect, it } from "vitest";
import { buildDemoRepo } from "@/db/demo";
import { computeDashboard } from "../dashboard";
import { execute, parseQuestion, type AssistantData } from "../assistant";
import { matches } from "../search";
import type { Txn } from "@/domain/types";

const today = "2026-10-06";
let d: AssistantData; let all: Txn[]; let names: Map<string, string>;
beforeAll(async () => {
  const repo = await buildDemoRepo(today);
  all = await repo.txns();
  const products = await repo.products();
  names = new Map(products.map((p) => [p.id, p.name]));
  d = {
    today, txns: all, dashboard: await computeDashboard(repo, today, true),
    resolve: { products, merchants: await repo.merchants() }, productName: (id) => names.get(id) ?? id,
  };
});
const ask = (q: string) => { const spec = parseQuestion(q, today); expect(spec, q).not.toBeNull(); return execute(spec!, d); };
const sumWhere = (f: (t: Txn) => boolean) => all.filter((t) => t.financialType === "expense" && f(t)).reduce((s, t) => s + t.amount, 0);
const fmt = (a: number) => `₪${Math.round(a / 100).toLocaleString("he-IL")}`;
const coffeeId = () => [...names.entries()].find(([, n]) => n === "קפה")![0];

describe("assistant answers come from the transactions, exactly", () => {
  it("כמה הוצאתי על קפה מתחילת השנה?", () => {
    const a = ask("כמה הוצאתי על קפה מתחילת השנה?");
    const expected = sumWhere((t) => t.productId === coffeeId() && t.date >= "2026-01-01");
    expect(a.text).toContain(fmt(expected));
    expect(a.query).toMatchObject({ productId: coffeeId(), from: "2026-01-01", to: today });
    // "Show Transactions" yields exactly the rows behind the number
    const L = { productName: (id?: string | null) => (id ? names.get(id) ?? "" : "") };
    const shown = all.filter((t) => t.financialType === "expense" && matches(t, a.query!, L));
    expect(shown.reduce((s, t) => s + t.amount, 0)).toBe(expected);
  });
  it("כמה פעמים קניתי קפה החודש?", () => {
    const a = ask("כמה פעמים קניתי קפה החודש?");
    const n = all.filter((t) => t.productId === coffeeId() && t.date >= "2026-10-01").length;
    expect(a.text).toContain(`${n} פעמים`);
  });
  it("כמה שילמתי על סלמון בממוצע?", () => {
    const a = ask("כמה שילמתי על סלמון בממוצע?");
    const salmon = all.filter((t) => names.get(t.productId ?? "") === "סלמון");
    const avg = salmon.reduce((s, t) => s + t.amount, 0) / salmon.length;
    expect(a.text).toContain(`₪${(avg / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`);
  });
  it("כמה הוצאתי ב-Wolt?", () => {
    const a = ask("כמה הוצאתי ב-Wolt?");
    expect(a.text).toContain(fmt(sumWhere((t) => t.merchantNormalized === "וולט")));
    expect(a.query?.merchant).toBe("וולט");
  });
  it("כמה הוצאתי על בגדים ב-Zara? (category + merchant)", () => {
    const a = ask("כמה הוצאתי על בגדים ב-Zara?");
    expect(a.query).toMatchObject({ categoryId: "s_clothing", merchant: "זארה" });
    expect(a.text).toContain(fmt(sumWhere((t) => t.subcategoryId === "s_clothing" && t.merchantNormalized === "זארה")));
  });
  it("כמה הוצאתי על מסעדות החודש?", () => {
    const a = ask("כמה הוצאתי על מסעדות החודש?");
    expect(a.text).toContain(fmt(sumWhere((t) => t.categoryId === "c_eating_out" && t.date >= "2026-10-01")));
  });
  it("כמה כסף נשאר לי להוציא השבוע? / צפוי לחסוך", () => {
    expect(ask("כמה כסף נשאר לי להוציא השבוע?").text).toContain(fmt(d.dashboard.remainingWeek));
    expect(ask("כמה אני צפוי לחסוך החודש?").text).toContain(fmt(d.dashboard.forecast.savings));
  });
  it("top products / category increases / fixed / subscriptions", () => {
    const top = ask("מה 20 המוצרים שאני קונה הכי הרבה?");
    expect(top.rows!.length).toBeGreaterThan(0); expect(top.rows!.length).toBeLessThanOrEqual(20);
    expect(ask("מה שלוש הקטגוריות שעלו הכי הרבה?").rows!.length).toBeLessThanOrEqual(3);
    expect(ask("מה ההוצאות הקבועות שלי?").rows!.some((r) => r.label.includes("שכר דירה") || r.label.includes("העברה"))).toBe(true);
    expect(ask("איזה מנויים התייקרו?").rows!.some((r) => r.label === "Spotify")).toBe(true);
    expect(ask("באילו מוצרים המחיר שלי עלה הכי הרבה?").rows!.length).toBeGreaterThan(0);
  });
  it("is honest when it cannot find the thing", () => {
    const a = ask("כמה הוצאתי על פלמינגו?");
    expect(a.ok).toBe(false);
    expect(a.text).toContain("פלמינגו");
  });
  it("does not parse unrelated chatter (falls through to the optional AI translator)", () => {
    expect(parseQuestion("מה מזג האוויר מחר?", today)).toBeNull();
  });
});
