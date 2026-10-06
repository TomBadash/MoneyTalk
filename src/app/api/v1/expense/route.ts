import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/db/api-key-auth";
import { ingestDrafts } from "@/services/ingest";
import { refreshSnapshot } from "@/services/refresh";
import { todayIsrael } from "@/services/clock";
import { resolveSub } from "@/classify/taxonomy";
import { rateLimit } from "@/lib/rate-limit";
import { toAgorot } from "@/engine/money";

const Body = z.object({
  description: z.string().trim().min(1, "description is required").max(200),
  amount: z.number().positive("amount must be positive").max(10_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

const err = (status: number, message: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

/** POST /api/v1/expense — add an expense from anywhere (shortcuts, bots, scripts). Bearer API key, read the docs in DEPLOYMENT.md. */
export async function POST(request: Request) {
  const auth = await authenticateApiKey(request.headers.get("authorization"));
  if ("error" in auth) return auth.error === "unavailable" ? err(503, "הממשק אינו מוגדר בשרת (SUPABASE_SERVICE_ROLE_KEY חסר).") : err(401, "מפתח API לא תקין או שבוטל.");
  if (!rateLimit(auth.limiterKey, 60)) return err(429, "יותר מדי בקשות. נסה שוב בעוד דקה.");

  let json: unknown;
  try { json = await request.json(); } catch { return err(400, "גוף הבקשה חייב להיות JSON תקין."); }
  const body = Body.safeParse(json);
  if (!body.success) return err(400, "בקשה לא תקינה.", { issues: body.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });

  const today = todayIsrael();
  const [created] = await ingestDrafts(auth.repo, [{ description: body.data.description, amount: toAgorot(body.data.amount), date: body.data.date ?? today, source: "api" }], today);
  if (!created) return err(500, "לא הצלחנו לשמור את ההוצאה.");
  await auth.repo.audit("transaction.api_add", created.txn.id);
  if (auth.userId) await refreshSnapshot(auth.repo, today).catch(() => undefined);

  const r = resolveSub(created.txn.subcategoryId ?? "s_uncategorized");
  return NextResponse.json({
    id: created.txn.id, description: body.data.description, amount: body.data.amount,
    category: r.categoryHe, subcategory: r.subHe, confidence: Math.round((created.classification.confidence) * 100) / 100,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
