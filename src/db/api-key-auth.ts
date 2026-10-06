import "server-only";
import type { Repo } from "./repo";
import { SupabaseRepo } from "./supabase";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDemoRepo } from "./demo";
import { safeEqual, sha256 } from "@/lib/crypto";
import { todayIsrael } from "@/services/clock";

export type KeyAuth = { repo: Repo; userId: string | null; limiterKey: string } | { error: "unauthorized" | "unavailable" };

/**
 * Resolve `Authorization: Bearer mt_…` to a user-scoped repo. Keys are stored only as SHA-256 hashes
 * and can be revoked. In local (no-Supabase) mode a dev key may be supplied via MONEYTALK_DEV_API_KEY.
 */
export async function authenticateApiKey(header: string | null): Promise<KeyAuth> {
  const m = header?.match(/^Bearer\s+(\S{10,200})$/i);
  if (!m) return { error: "unauthorized" };
  const key = m[1];
  const hash = sha256(key);

  if (!isSupabaseConfigured()) {
    const dev = process.env.MONEYTALK_DEV_API_KEY;
    if (!dev || !safeEqual(dev, key)) return { error: "unauthorized" };
    return { repo: await getDemoRepo(todayIsrael()), userId: null, limiterKey: `k:${hash.slice(0, 12)}` };
  }
  const sb = createServiceClient();
  if (!sb) return { error: "unavailable" };
  const { data } = await sb.from("api_keys").select("id, user_id, revoked_at").eq("key_hash", hash).maybeSingle();
  if (!data || data.revoked_at) return { error: "unauthorized" };
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { repo: new SupabaseRepo(sb, data.user_id), userId: data.user_id, limiterKey: `k:${hash.slice(0, 12)}` };
}
