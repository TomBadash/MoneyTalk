import { z } from "zod";

/**
 * The ONLY thing a language model is allowed to produce for the assistant: a structured query.
 * All numbers come from deterministic code over the user's transactions — never from the model.
 */
export const METRICS = [
  "sum", "count", "avg", "top_products", "top_categories", "top_merchants", "category_changes",
  "product_price_changes", "safe_to_spend_week", "safe_to_spend_month", "forecast_savings", "savings_rate",
  "fixed_expenses", "subscription_changes",
] as const;

export const PERIODS = ["today", "week", "month", "last_month", "quarter", "year", "ytd", "last_year", "all", "custom"] as const;

export const QuerySpecSchema = z.object({
  metric: z.enum(METRICS),
  /** Free-text entity mentions exactly as the user wrote them (e.g. "קפה", "Wolt", "בגדים"). Resolved locally. */
  entities: z.array(z.string().max(60)).max(4),
  period: z.enum(PERIODS),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  compare: z.enum(["none", "prev_period", "prev_year"]),
  limit: z.number().int().min(1).max(50).nullable(),
});
export type QuerySpec = z.infer<typeof QuerySpecSchema>;
