import { route, json } from "@/lib/api";
import { runDaily } from "@/jobs/daily";
import { getAiProvider } from "@/ai";
import { getProvider } from "@/providers/registry";
import { decryptSecret } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";

/** POST /api/sync — run the same incremental pipeline as the nightly job, for the signed-in user. */
export const POST = route(async (ctx) => {
  if (!rateLimit(`sync:${ctx.userId ?? "local"}`, 6)) return json({ error: "ניסיונות רבים מדי. נסה שוב בעוד דקה." }, 429);
  const r = await runDaily(ctx.write, ctx.today, { ai: getAiProvider(), provider: getProvider, decrypt: decryptSecret });
  return json(r);
});
