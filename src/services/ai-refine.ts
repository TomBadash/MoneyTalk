import type { Repo } from "@/db/repo";
import type { AiProvider } from "@/ai/provider";
import { resolveSub } from "@/classify/taxonomy";

/**
 * Ingestion-time, never page-load: ask the model about transactions the rules could not classify.
 * Sends only the merchant/description text and the amount rounded to ₪10. A model suggestion is
 * capped below the auto-approve band, so it is shown with the AI badge and never silently "learned".
 */
export async function refineWithAi(repo: Repo, ai: AiProvider, limit = 40): Promise<{ asked: number; updated: number }> {
  if (!ai.available) return { asked: 0, updated: 0 };
  const queue = (await repo.txns({ needsReview: true, limit })).filter((t) => !t.userCorrected && t.aiClassificationVersion !== `llm:${ai.name}`);
  if (!queue.length) return { asked: 0, updated: 0 };
  const results = await ai.classify(queue.map((t) => ({ id: t.id, text: (t.merchantRaw || t.descriptionRaw).slice(0, 80), amountShekels: Math.round(t.amount / 1000) * 10 })));
  let updated = 0;
  for (const r of results) {
    const t = queue.find((x) => x.id === r.id);
    if (!t) continue;
    const c = resolveSub(r.subcategoryId);
    const confident = r.confidence >= 0.7 && r.subcategoryId !== "s_uncategorized";
    await repo.updateTxn(t.id, {
      aiClassificationVersion: `llm:${ai.name}`, aiConfidence: Math.min(r.confidence, 0.89),
      aiReasoningSummary: `הוצע על ידי AI: ${r.reason}`,
      ...(confident ? {
        subcategoryId: c.subcategoryId, categoryId: c.categoryId, parentCategoryId: c.parentCategoryId,
        financialType: c.financialType, consumptionType: c.financialType === "expense" ? c.consumptionType : null, needsReview: false,
      } : {}),
    });
    if (confident) updated++;
  }
  return { asked: queue.length, updated };
}
