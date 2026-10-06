import { route, json } from "@/lib/api";
import { analyze, resolvePeriod, RANGES, COMPARES, type Range, type Compare } from "@/services/analytics";

/** GET /api/analytics?range=month&cmp=prev&basis=cash&cat=&merchant=&product=&from=&to= */
export const GET = route(async (ctx, req) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const range = (sp.range && sp.range in RANGES ? sp.range : "month") as Range;
  const compare = (sp.cmp === "none" ? null : sp.cmp && sp.cmp in COMPARES ? sp.cmp : "prev") as Compare | null;
  const [all, products] = await Promise.all([ctx.read.txns(), ctx.read.products()]);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const a = analyze(all, { period: resolvePeriod(range, ctx.today, sp.from, sp.to), compare, basis: sp.basis === "purchase" ? "purchase" : "cash", drill: { cat: sp.cat, merchant: sp.merchant, product: sp.product }, productName: (id) => names.get(id) ?? "מוצר" });
  const { matching, ...rest } = a;
  return json({ ...rest, transactionIds: matching.map((t) => t.id) });
});
