import { route, json } from "@/lib/api";
import { paramsToQuery, matches } from "@/services/search";

/** GET /api/transactions?q=&from=&to=&cat=&merchant=&product=&min=&max=&review=1&limit=50&offset=0 */
export const GET = route(async (ctx, req) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const q = paramsToQuery(sp, ctx.today);
  const [all, products] = await Promise.all([ctx.read.txns({ from: q.from, to: q.to }), ctx.read.products()]);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const rows = all.filter((t) => matches(t, q, { productName: (id) => (id ? names.get(id) ?? "" : "") }));
  const limit = Math.min(500, Math.max(1, Number(sp.limit) || 50)), offset = Math.max(0, Number(sp.offset) || 0);
  return json({ total: rows.length, items: rows.slice(offset, offset + limit).map((t) => ({ ...t, productName: t.productId ? names.get(t.productId) ?? null : null })) });
});
