import { route, json } from "@/lib/api";
import { merchantStats } from "@/engine/analytics";

export const GET = route(async (ctx) => json(merchantStats(await ctx.read.txns())));
