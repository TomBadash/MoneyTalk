import type { QuerySpec } from "./query-spec";

export type AiClassifyItem = { id: string; text: string; amountShekels: number };
export type AiClassifyResult = { id: string; subcategoryId: string; confidence: number; reason: string };

/**
 * Swap the model vendor by implementing this. The app never depends on a concrete provider,
 * and nothing here ever returns money values — only labels and a structured query.
 */
export interface AiProvider {
  readonly name: string;
  readonly available: boolean;
  /** Suggest a subcategory for low-confidence items. Input is only the merchant/description text and a rounded amount. */
  classify(items: AiClassifyItem[]): Promise<AiClassifyResult[]>;
  /** Translate a natural-language question into a structured, validated query (or null if it isn't a finance question). */
  toQuerySpec(question: string, today: string): Promise<QuerySpec | null>;
}

export class NoopAi implements AiProvider {
  readonly name = "none";
  readonly available = false;
  async classify() { return []; }
  async toQuerySpec() { return null; }
}
