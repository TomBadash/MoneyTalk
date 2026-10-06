import type { ConsumptionType, FinancialType, Txn } from "@/domain/types";
import { findMerchant, findProduct } from "./rules";
import { normalizeText } from "./normalize";
import { resolveSub, type Resolved } from "./taxonomy";
import type { RuleIndex } from "./memory";

export const CLASSIFIER_VERSION = "rules-v1";

export type Source = "user_rule" | "dictionary" | "history" | "llm" | "fallback";

export type Classification = {
  productName: string | null;
  merchantName: string | null; // canonical merchant if recognised
  subcategoryId: string;
  categoryId: string;
  parentCategoryId: string;
  financialType: FinancialType;
  consumptionType: ConsumptionType | null;
  confidence: number;
  source: Source;
  reason: string; // Hebrew, shown under "Why?"
  version: string;
};

/** Bands from the spec: ≥0.9 auto, 0.7–0.89 auto + subtle AI badge, <0.7 review queue. */
export type Band = "auto" | "ai" | "review";
export const band = (c: number): Band => (c >= 0.9 ? "auto" : c >= 0.7 ? "ai" : "review");

export type ClassifyInput = {
  description: string; // product/description text as typed or imported
  merchant?: string | null; // raw merchant if separate (bank imports)
  amount: number; // agorot
  history?: Pick<Txn, "merchantNormalized" | "subcategoryId" | "date">[];
  rules: RuleIndex;
};

const finish = (
  r: Resolved, p: Omit<Classification, "subcategoryId" | "categoryId" | "parentCategoryId" | "financialType" | "consumptionType" | "version">,
): Classification => ({
  ...p,
  subcategoryId: r.subcategoryId, categoryId: r.categoryId, parentCategoryId: r.parentCategoryId,
  financialType: r.financialType, consumptionType: r.consumptionType, version: CLASSIFIER_VERSION,
});

const BIG_PURCHASE = 300_000; // ₪3,000

export function classify(i: ClassifyInput): Classification {
  const text = [i.merchant, i.description].filter(Boolean).join(" ");
  const descKey = normalizeText(i.description);
  const mHit = findMerchant(i.merchant ? i.merchant : text);
  const merchantKey = mHit ? normalizeText(mHit.entry.name) : i.merchant ? normalizeText(i.merchant) : null;
  const pHit = findProduct(i.description, mHit?.matched);
  const productName = pHit?.entry.name ?? null;
  const merchantName = mHit?.entry.name ?? null;

  // 1) learned user rules — strongest evidence
  const ruleProduct = productName ? i.rules.get(`product:${normalizeText(productName)}`) : undefined;
  const ruleDesc = i.rules.get(`description:${descKey}`);
  const ruleMerchant = merchantKey ? i.rules.get(`merchant:${merchantKey}`) : undefined;
  const learned = ruleDesc ?? ruleProduct ?? ruleMerchant;
  if (learned) {
    const conf = Math.min(0.99, 0.93 + learned.weight * 0.01);
    const what = learned.scope === "merchant" ? "עסקאות קודמות מבית עסק זה" : learned.scope === "product" ? "המוצר הזה" : "תיאור זהה";
    const r = resolveSub(learned.subcategoryId);
    return finish(r, {
      productName, merchantName, confidence: conf, source: "user_rule",
      reason: `סווג כ"${r.categoryHe}" כי תיקנת בעבר: ${what} ← ${r.categoryHe}.`,
    });
  }

  // 2) dictionary: product + merchant evidence
  if (pHit && mHit) {
    const rp = resolveSub(pHit.entry.sub), rm = resolveSub(mHit.entry.sub);
    // e.g. "חולצה זארה": both say Shopping/Clothing → very confident; conflict → product wins, lower conf.
    const agree = rp.categoryId === rm.categoryId || rp.parentCategoryId === rm.parentCategoryId;
    const r = rp; // product is more specific than merchant
    return finish(r, {
      productName, merchantName, confidence: agree ? 0.97 : 0.8, source: "dictionary",
      reason: agree
        ? `המוצר "${productName}" ובית העסק "${merchantName}" מצביעים על "${r.categoryHe}".`
        : `זוהה המוצר "${productName}" (${r.categoryHe}) בבית העסק "${merchantName}".`,
    });
  }
  if (pHit) {
    const r = resolveSub(pHit.entry.sub);
    const conf = pHit.exact ? 0.95 : 0.86;
    return finish(r, {
      productName, merchantName: null, confidence: conf, source: "dictionary",
      reason: `זוהה המוצר "${productName}" ← ${r.categoryHe} › ${r.subHe}.`,
    });
  }

  // 3) history of the same merchant
  const mk = merchantKey ?? descKey;
  const past = (i.history ?? []).filter((h) => h.merchantNormalized === mk && h.subcategoryId);
  if (past.length >= 2 && !mHit) {
    const tally = new Map<string, number>();
    past.forEach((h) => tally.set(h.subcategoryId!, (tally.get(h.subcategoryId!) ?? 0) + 1));
    const [sub, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    const r = resolveSub(sub);
    const conf = Math.min(0.92, 0.55 + 0.37 * (n / past.length) * Math.min(1, past.length / 5));
    return finish(r, {
      productName: null, merchantName: null, confidence: conf, source: "history",
      reason: `עסקאות קודמות מבית עסק זה סווגו כ"${r.categoryHe}" (${n} מתוך ${past.length}).`,
    });
  }
  if (mHit) {
    const r = resolveSub(mHit.entry.sub);
    return finish(r, {
      productName: null, merchantName, confidence: mHit.entry.conf ?? 0.9, source: "dictionary",
      reason: `בית העסק "${merchantName}" מוכר כ"${r.categoryHe}".`,
    });
  }

  // 4) fallback — never guess confidently
  const r = resolveSub("s_uncategorized");
  const consumption: ConsumptionType = i.amount >= BIG_PURCHASE ? "one_off" : "variable_essential";
  return { ...finish(r, { productName: null, merchantName: null, confidence: 0.3, source: "fallback", reason: "לא הצלחנו לזהות את הקנייה — אשמח שתבחר קטגוריה, ואזכור לפעם הבאה." }), consumptionType: consumption };
}
