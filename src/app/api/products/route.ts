import { route, json } from "@/lib/api";
import { productStats } from "@/engine/analytics";

export const GET = route(async (ctx) => {
  const [txns, products] = await Promise.all([ctx.read.txns(), ctx.read.products()]);
  const names = new Map(products.map((p) => [p.id, p]));
  return json(productStats(txns).filter((s) => names.has(s.productId)).map((s) => ({ ...s, name: names.get(s.productId)!.name, categoryId: names.get(s.productId)!.categoryId })).sort((a, b) => b.count - a.count));
});
