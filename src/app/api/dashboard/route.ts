import { route, json } from "@/lib/api";
import { getDashboard } from "@/services/dashboard";

export const GET = route(async (ctx) => json(await getDashboard(ctx.read, ctx.today, ctx.demo)));
