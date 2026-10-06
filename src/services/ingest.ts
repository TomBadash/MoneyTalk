import type { IsoDate, Txn } from "@/domain/types";
import { classify, band, type Classification } from "@/classify/pipeline";
import { indexRules, type RuleIndex } from "@/classify/memory";
import { normalizeText } from "@/classify/normalize";
import { parseQuick } from "@/classify/quick-parse";
import { filterNew } from "@/engine/dedupe";
import { addDays, addMonths } from "@/engine/period";
import type { Repo } from "@/db/repo";

export type Draft = {
  description: string;
  merchant?: string | null;
  amount: number; // agorot, positive
  date: IsoDate;
  direction?: "debit" | "credit";
  source?: string; // manual | api | csv | provider id
  externalId?: string | null;
  accountId?: string | null;
  paymentMethod?: Txn["paymentMethod"];
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  /** Provider-supplied hint (e.g. salary credit). */
  forceFinancialType?: Txn["financialType"];
};

export type Ingested = { txn: Txn; classification: Classification };
type Prepared = Ingested & { draft: Draft };

const isTyped = (source?: string) => !source || source === "manual" || source === "api";

/** Pure: draft + classification → transaction row. Raw merchant/description are kept verbatim. */
export function toTxn(d: Draft, c: Classification, id = crypto.randomUUID()): Txn {
  const isCredit = d.direction === "credit";
  const financialType = d.forceFinancialType ?? (isCredit && c.financialType === "expense" ? "income" : c.financialType);
  return {
    id, externalId: d.externalId ?? null, accountId: d.accountId ?? null, sourceProvider: d.source ?? "manual",
    date: d.date, merchantRaw: d.merchant ?? c.merchantName ?? d.description,
    merchantNormalized: normalizeText(c.merchantName ?? d.merchant ?? d.description),
    descriptionRaw: d.description, amount: d.amount, currency: "ILS",
    transactionType: isCredit ? "credit" : "debit",
    subcategoryId: c.subcategoryId, categoryId: c.categoryId, parentCategoryId: c.parentCategoryId,
    financialType, consumptionType: financialType === "expense" ? c.consumptionType : null,
    recurringStatus: "none", paymentMethod: d.paymentMethod ?? null,
    installmentNumber: d.installmentNumber ?? null, installmentTotal: d.installmentTotal ?? null,
    aiConfidence: c.confidence, aiClassificationVersion: c.version, aiReasoningSummary: c.reason,
    userCorrected: false, needsReview: band(c.confidence) === "review",
  };
}

export type IngestContext = { rules: RuleIndex; history: Txn[] };

export async function loadIngestContext(repo: Repo, today: IsoDate): Promise<IngestContext> {
  const [rules, history] = await Promise.all([repo.rules(), repo.txns({ from: addMonths(today, -12) })]);
  return { rules: indexRules(rules), history };
}

/** For typed entries ("חולצה זארה") the product is whatever remains once the merchant is removed. */
function typedProductName(d: Draft, c: Classification): string | null {
  if (!isTyped(d.source) || c.source === "fallback") return null;
  const merchantWords = c.merchantName ? normalizeText(c.merchantName) : "";
  const name = normalizeText(d.description).replace(merchantWords, "").replace(/\s+/g, " ").trim();
  return name.length >= 2 ? name : null;
}

/**
 * normalise → dedupe → classify → persist → remember merchant/product.
 * Incremental: only the incoming drafts are processed. Returns what was actually created.
 */
export async function ingestDrafts(repo: Repo, drafts: Draft[], today: IsoDate, ctx?: IngestContext): Promise<Ingested[]> {
  if (drafts.length === 0) return [];
  const c = ctx ?? (await loadIngestContext(repo, today));
  const hist = c.history.map((h) => ({ merchantNormalized: h.merchantNormalized, subcategoryId: h.subcategoryId ?? "", date: h.date }));
  const prepared: Prepared[] = drafts.map((draft) => {
    const classification = classify({ description: draft.description, merchant: draft.merchant, amount: draft.amount, rules: c.rules, history: hist });
    return { draft, classification, txn: toTxn(draft, classification) };
  });

  // Dedupe provider imports against stored history; typed entries are intentional and never deduped.
  const imported = prepared.filter((p) => !isTyped(p.draft.source));
  const fresh = new Set(filterNew(c.history, imported.map((p) => p.txn)).map((t) => t.id));
  const keep = prepared.filter((p) => isTyped(p.draft.source) || fresh.has(p.txn.id));

  for (const k of keep) {
    const cls = k.classification;
    if (cls.merchantName) {
      const m = await repo.upsertMerchant({ name: cls.merchantName, normalized: normalizeText(cls.merchantName), defaultSubcategoryId: cls.subcategoryId });
      k.txn.merchantId = m.id;
    }
    const productName = cls.productName ?? typedProductName(k.draft, cls);
    if (productName && k.txn.financialType === "expense") {
      const p = await repo.upsertProduct({
        name: productName, normalized: normalizeText(productName),
        subcategoryId: cls.subcategoryId, categoryId: cls.categoryId, parentCategoryId: cls.parentCategoryId,
      });
      k.txn.productId = p.id;
    }
  }
  const inserted = new Set((await repo.insertTxns(keep.map((k) => k.txn))).map((t) => t.id));
  return keep.filter((k) => inserted.has(k.txn.id)).map(({ txn, classification }) => ({ txn, classification }));
}

export type QuickAddResult = { ok: true; created: Ingested } | { ok: false; error: string };

export async function quickAdd(
  repo: Repo, text: string, today: IsoDate, opts: { source?: "manual" | "api"; ctx?: IngestContext } = {},
): Promise<QuickAddResult> {
  const p = parseQuick(text);
  if (!p.description) return { ok: false, error: "מה קנית? כתוב למשל: קפה 18" };
  if (p.amount == null || p.amount <= 0) return { ok: false, error: "לא זיהינו סכום. כתוב למשל: קפה 18" };
  if (p.amount > 100_000_000) return { ok: false, error: "הסכום גדול מדי." };
  const date = p.dateOffsetDays ? addDays(today, p.dateOffsetDays) : today;
  const [created] = await ingestDrafts(repo, [{ description: p.description, amount: p.amount, date, source: opts.source ?? "manual" }], today, opts.ctx);
  return created ? { ok: true, created } : { ok: false, error: "לא הצלחנו לשמור את ההוצאה. נסה שוב." };
}
