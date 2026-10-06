import { normalizeText } from "./normalize";

/** A learned rule. Scope decides what key it matches; user rules always beat the seed dictionary. */
export type LearnedRule = {
  scope: "merchant" | "product" | "description";
  key: string; // normalised
  subcategoryId: string;
  weight: number; // grows with repeated confirmations
  hits: number;
  source: "user" | "ai";
};

export const ruleId = (r: Pick<LearnedRule, "scope" | "key">) => `${r.scope}:${r.key}`;

export type Correction = {
  merchant?: string | null; // normalised merchant name
  product?: string | null; // canonical product name
  description: string;
  subcategoryId: string;
};

/**
 * Turn a user correction into rule upserts. Merchant rule only when the merchant is known,
 * product rule only when a product was identified, and always an exact-description rule so the
 * same text never has to be corrected twice ("קפה הפוך" → Coffee).
 */
export function learnFromCorrection(existing: LearnedRule[], c: Correction): LearnedRule[] {
  const wanted: Omit<LearnedRule, "weight" | "hits">[] = [];
  const desc = normalizeText(c.description);
  if (desc) wanted.push({ scope: "description", key: desc, subcategoryId: c.subcategoryId, source: "user" });
  if (c.product) wanted.push({ scope: "product", key: normalizeText(c.product), subcategoryId: c.subcategoryId, source: "user" });
  if (c.merchant) wanted.push({ scope: "merchant", key: normalizeText(c.merchant), subcategoryId: c.subcategoryId, source: "user" });
  const byId = new Map(existing.map((r) => [ruleId(r), r]));
  return wanted.map((w) => {
    const prev = byId.get(ruleId(w));
    const same = prev && prev.subcategoryId === w.subcategoryId;
    return { ...w, hits: (prev?.hits ?? 0) + 1, weight: same ? Math.min(10, prev!.weight + 1) : 1 };
  });
}

export type RuleIndex = Map<string, LearnedRule>;
export const indexRules = (rs: LearnedRule[]): RuleIndex => new Map(rs.map((r) => [ruleId(r), r]));
