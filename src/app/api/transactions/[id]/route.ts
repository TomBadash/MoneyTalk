import { z } from "zod";
import { route, json, fail, body } from "@/lib/api";
import { correctTransaction } from "@/services/correct";
import { isKnownSub } from "@/classify/taxonomy";
import { refreshSnapshot } from "@/services/refresh";

const Patch = z.object({ subcategoryId: z.string().refine(isKnownSub, "unknown subcategory").optional(), notes: z.string().max(500).nullable().optional() }).strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idOk = z.string().uuid().safeParse(id);
  if (!idOk.success) return fail(400, "מזהה לא תקין.");
  return route(async (ctx) => {
    const patch = await body(req, Patch);
    if (!(await ctx.write.txn(id))) return fail(404, "העסקה לא נמצאה.");
    if (patch.notes !== undefined) await ctx.write.updateTxn(id, { notes: patch.notes });
    if (patch.subcategoryId) await correctTransaction(ctx.write, id, patch.subcategoryId, ctx.today);
    await refreshSnapshot(ctx.write, ctx.today).catch(() => undefined);
    return json(await ctx.write.txn(id));
  })(req);
}
