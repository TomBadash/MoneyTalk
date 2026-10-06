import { z } from "zod";
import { route, json, fail, body } from "@/lib/api";
import { getProvider, listProviders } from "@/providers/registry";

export const GET = route(async (ctx) => json({ connections: await ctx.read.connections(), providers: listProviders().map((p) => ({ id: p.id, name: p.displayName })) }));

/** POST { provider } → { redirectUrl, state }: begins provider-hosted, read-only consent. No credentials pass through this app. */
export const POST = route(async (ctx, req) => {
  const { provider } = await body(req, z.object({ provider: z.string().max(30) }));
  const p = getProvider(provider);
  if (!p) return fail(404, "ספק לא מוכר.");
  const r = await p.beginConnect({ userId: ctx.userId ?? "local", returnUrl: "/accounts" });
  await ctx.write.audit("connection.begin", provider);
  return json(r);
});
