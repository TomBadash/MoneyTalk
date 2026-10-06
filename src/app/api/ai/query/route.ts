import { z } from "zod";
import { route, json, body } from "@/lib/api";
import { askAction } from "@/app/actions";

export const POST = route(async (_ctx, req) => json(await askAction((await body(req, z.object({ question: z.string().min(2).max(300) }))).question)));
