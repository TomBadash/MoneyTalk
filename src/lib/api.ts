import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { getContextOrNull, type AppContext } from "./context";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const fail = (status: number, message: string, extra: Record<string, unknown> = {}) => json({ error: message, ...extra }, status);

/** Session-authenticated JSON endpoint: 401 without a session, 400 with readable validation errors, 500 without leaking internals. */
export function route(handler: (ctx: AppContext, req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const ctx = await getContextOrNull();
    if (!ctx) return fail(401, "יש להתחבר.");
    try { return await handler(ctx, req); }
    catch (e) {
      if (e instanceof ZodError) return fail(400, "בקשה לא תקינה.", { issues: e.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
      return fail(500, "משהו השתבש. נסה שוב.");
    }
  };
}
export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> { return schema.parse(await req.json()); }
