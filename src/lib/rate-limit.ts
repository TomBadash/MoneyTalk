/** Best-effort in-memory token bucket (per server instance). Enough to blunt abuse of AI/API endpoints. */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}
