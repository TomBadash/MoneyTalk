import { z } from "zod";
import { route, json, body } from "@/lib/api";
import { isKnownSub, nodeInfo } from "@/classify/taxonomy";
import { refreshSnapshot } from "@/services/refresh";

export const GET = route(async (ctx) => json({ budgets: await ctx.read.budgets(), profile: await ctx.read.profile() }));

const Put = z.object({ categoryId: z.string().max(40).nullable(), amount: z.number().int().min(0).max(1_000_000_000) }); // agorot
export const PUT = route(async (ctx, req) => {
  const b = await body(req, Put);
  if (b.categoryId && !(isKnownSub(b.categoryId) || nodeInfo(b.categoryId).id === b.categoryId)) return json({ error: "קטגוריה לא מוכרת." }, 400);
  await ctx.write.setBudget(b.categoryId, b.amount, "user");
  await refreshSnapshot(ctx.write, ctx.today).catch(() => undefined);
  return json({ ok: true });
});
