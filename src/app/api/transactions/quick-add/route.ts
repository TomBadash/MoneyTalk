import { z } from "zod";
import { route, json, fail, body } from "@/lib/api";
import { quickAdd } from "@/services/ingest";
import { refreshSnapshot } from "@/services/refresh";
import { resolveSub } from "@/classify/taxonomy";

export const POST = route(async (ctx, req) => {
  const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(200) }));
  const r = await quickAdd(ctx.write, text, ctx.today);
  if (!r.ok) return fail(422, r.error);
  await refreshSnapshot(ctx.write, ctx.today).catch(() => undefined);
  const c = resolveSub(r.created.txn.subcategoryId ?? "s_uncategorized");
  return json({ id: r.created.txn.id, description: r.created.txn.descriptionRaw, amount: r.created.txn.amount, category: c.categoryHe, subcategory: c.subHe, confidence: r.created.classification.confidence, reason: r.created.classification.reason }, 201);
});
