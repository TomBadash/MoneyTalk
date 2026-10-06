import type { IsoDate, Txn } from "@/domain/types";
import type { Repo } from "@/db/repo";
import { learnFromCorrection } from "@/classify/memory";
import { normalizeText } from "@/classify/normalize";
import { classify, band } from "@/classify/pipeline";
import { indexRules } from "@/classify/memory";
import { resolveSub } from "@/classify/taxonomy";
import { addMonths } from "@/engine/period";

/**
 * Apply a user's category choice to one transaction, persist what we learned
 * (merchant/product/description rules) and re-run classification on *unreviewed*
 * look-alikes so the same correction is never requested twice.
 */
export async function correctTransaction(repo: Repo, id: string, subcategoryId: string, today: IsoDate): Promise<{ updated: number }> {
  const t = await repo.txn(id);
  if (!t) return { updated: 0 };
  const r = resolveSub(subcategoryId);
  const products = await repo.products();
  const productName = t.productId ? products.find((p) => p.id === t.productId)?.name : null;
  const merchantName = t.merchantId ? (await repo.merchants()).find((m) => m.id === t.merchantId)?.name : null;

  const existing = await repo.rules();
  await repo.upsertRules(learnFromCorrection(existing, {
    merchant: merchantName ?? (t.sourceProvider !== "manual" ? t.merchantNormalized : null),
    product: productName ?? null,
    description: t.descriptionRaw || t.merchantRaw,
    subcategoryId,
  }));

  await repo.updateTxn(id, {
    subcategoryId: r.subcategoryId, categoryId: r.categoryId, parentCategoryId: r.parentCategoryId,
    financialType: r.financialType, consumptionType: r.financialType === "expense" ? r.consumptionType : null,
    userCorrected: true, needsReview: false, aiConfidence: 1,
    aiReasoningSummary: `אישרת ידנית: ${r.categoryHe} › ${r.subHe}.`,
  });

  // re-classify untouched look-alikes with the new rules
  const rules = indexRules(await repo.rules());
  const history = await repo.txns({ from: addMonths(today, -12) });
  let updated = 1;
  for (const o of history) {
    if (o.id === id || o.userCorrected) continue;
    const sameMerchant = merchantName && o.merchantNormalized === normalizeText(merchantName);
    const sameDesc = normalizeText(o.descriptionRaw) === normalizeText(t.descriptionRaw);
    const sameProduct = t.productId && o.productId === t.productId;
    if (!(sameMerchant || sameDesc || sameProduct)) continue;
    const c = classify({ description: o.descriptionRaw, merchant: o.sourceProvider === "manual" ? null : o.merchantRaw, amount: o.amount, rules });
    if (c.subcategoryId === o.subcategoryId && !o.needsReview) continue;
    await repo.updateTxn(o.id, {
      subcategoryId: c.subcategoryId, categoryId: c.categoryId, parentCategoryId: c.parentCategoryId,
      financialType: c.financialType, consumptionType: c.financialType === "expense" ? c.consumptionType : null,
      aiConfidence: c.confidence, aiReasoningSummary: c.reason, needsReview: band(c.confidence) === "review",
    });
    updated++;
  }
  await repo.audit("transaction.corrected", id, { subcategoryId });
  return { updated };
}

/** One-tap approval from the Review Queue: keep the AI's guess, but record it as confirmed. */
export async function approveClassification(repo: Repo, id: string): Promise<void> {
  const t = await repo.txn(id);
  if (!t?.subcategoryId) return;
  const products = await repo.products();
  const merchants = await repo.merchants();
  const rules = await repo.rules();
  await repo.upsertRules(learnFromCorrection(rules, {
    merchant: t.merchantId ? merchants.find((m) => m.id === t.merchantId)?.name : null,
    product: t.productId ? products.find((p) => p.id === t.productId)?.name : null,
    description: t.descriptionRaw || t.merchantRaw, subcategoryId: t.subcategoryId,
  }));
  await repo.updateTxn(id, { needsReview: false, userCorrected: true, aiConfidence: 1 });
}

export type { Txn };
