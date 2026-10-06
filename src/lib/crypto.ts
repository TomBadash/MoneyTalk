import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM for secrets at rest (provider tokens). The key comes from APP_ENCRYPTION_KEY
 * (base64, 32 bytes) and never leaves the server. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
let devKey: Buffer | undefined;
function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
    return k;
  }
  if (process.env.NODE_ENV === "production") throw new Error("APP_ENCRYPTION_KEY is required in production");
  return (devKey ??= randomBytes(32)); // ephemeral, dev only: tokens do not survive a restart
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(token: string): string {
  const [v, iv, tag, ct] = token.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Constant-time string comparison (cron secret, API keys). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function newApiKey(): { key: string; hash: string; prefix: string } {
  const key = `mt_${randomBytes(24).toString("base64url")}`;
  return { key, hash: sha256(key), prefix: key.slice(0, 10) };
}
