import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { SupabaseRepo } from "@/db/supabase";
import { runDaily } from "@/jobs/daily";
import { getAiProvider } from "@/ai";
import { getProvider } from "@/providers/registry";
import { decryptSecret, safeEqual } from "@/lib/crypto";
import { todayIsrael } from "@/services/clock";

export const maxDuration = 300;

/** Daily processing for every user. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(secret, given)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "service role key not configured" }, { status: 503 });

  const { data: users, error } = await sb.from("profiles").select("user_id");
  if (error) return NextResponse.json({ error: "could not list users" }, { status: 500 });
  const today = todayIsrael();
  const ai = getAiProvider();
  const results: { ok: boolean }[] = [];
  for (const u of users ?? []) {
    try {
      const r = await runDaily(new SupabaseRepo(sb, u.user_id), today, { ai, provider: getProvider, decrypt: decryptSecret });
      results.push({ ok: r.status === "ok" });
    } catch { results.push({ ok: false }); } // one user's failure never stops the others
  }
  return NextResponse.json({ users: results.length, ok: results.filter((r) => r.ok).length, date: today });
}
