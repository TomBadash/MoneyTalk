import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AiClassifyItem, AiClassifyResult, AiProvider } from "./provider";
import { METRICS, PERIODS, QuerySpecSchema, type QuerySpec } from "./query-spec";
import { SUBS, CATS, isKnownSub } from "@/classify/taxonomy";

// Cheap, structured, low-effort calls. Override with MONEYTALK_AI_MODEL to trade cost for quality.
const MODEL = process.env.MONEYTALK_AI_MODEL ?? "claude-opus-5-5";

// Structured-output schemas avoid numeric/regex constraints; results are re-validated locally.
const ClassifyOut = z.object({ results: z.array(z.object({ id: z.string(), subcategoryId: z.string(), confidence: z.number(), reason: z.string() })) });
const SpecOut = z.object({
  isFinanceQuestion: z.boolean(),
  metric: z.enum(METRICS), entities: z.array(z.string()), period: z.enum(PERIODS),
  from: z.string().nullable(), to: z.string().nullable(), compare: z.enum(["none", "prev_period", "prev_year"]), limit: z.number().nullable(),
});

const TAXONOMY = SUBS.map((s) => `${s.id} = ${CATS.find((c) => c.id === s.cat)!.he} › ${s.he}`).join("\n");

export class AnthropicAi implements AiProvider {
  readonly name = `anthropic:${MODEL}`;
  readonly available = true;
  private client = new Anthropic();

  async classify(items: AiClassifyItem[]): Promise<AiClassifyResult[]> {
    if (!items.length) return [];
    try {
      const msg = await this.client.messages.parse({
        model: MODEL, max_tokens: 4000,
        system: `You categorise Israeli bank/credit-card transactions (Hebrew or English merchant text) into this fixed taxonomy. Use ONLY these subcategory ids:\n${TAXONOMY}\nReturn one result per input id. confidence is 0..1 and must reflect real uncertainty; use s_uncategorized with low confidence when the text gives no clue. reason is one short Hebrew sentence. Never invent amounts.`,
        messages: [{ role: "user", content: JSON.stringify(items) }],
        output_config: { effort: "low", format: zodOutputFormat(ClassifyOut) },
      });
      if (msg.stop_reason === "refusal" || !msg.parsed_output) return [];
      return msg.parsed_output.results.filter((r) => isKnownSub(r.subcategoryId) && items.some((i) => i.id === r.id))
        .map((r) => ({ ...r, confidence: Math.max(0, Math.min(1, r.confidence)) }));
    } catch (e) {
      if (e instanceof Anthropic.APIError) return []; // temporary AI trouble must never block ingestion
      throw e;
    }
  }

  async toQuerySpec(question: string, today: string): Promise<QuerySpec | null> {
    try {
      const msg = await this.client.messages.parse({
        model: MODEL, max_tokens: 1500,
        system: `You translate a Hebrew personal-finance question into a structured query. You never compute or state numbers — another system does that from the user's transactions. Today is ${today}. metric: sum|count|avg (how much / how many times / average price), top_products, top_categories, top_merchants, category_changes (what rose), product_price_changes, safe_to_spend_week|month, forecast_savings, savings_rate, fixed_expenses, subscription_changes. entities: the product / merchant / category words exactly as written (e.g. "קפה", "Wolt", "בגדים"). period: today|week|month|last_month|quarter|year|ytd|last_year|all|custom (custom needs from/to as YYYY-MM-DD). If it is not a question about the user's finances, set isFinanceQuestion=false.`,
        messages: [{ role: "user", content: question }],
        output_config: { effort: "low", format: zodOutputFormat(SpecOut) },
      });
      const o = msg.parsed_output;
      if (msg.stop_reason === "refusal" || !o || !o.isFinanceQuestion) return null;
      const parsed = QuerySpecSchema.safeParse({ ...o, limit: o.limit == null ? null : Math.max(1, Math.min(50, Math.round(o.limit))) });
      return parsed.success ? parsed.data : null;
    } catch (e) {
      if (e instanceof Anthropic.APIError) return null;
      throw e;
    }
  }
}
