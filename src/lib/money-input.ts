/** "1,250.50", "₪ 300", "300 ש\"ח" → integer agorot, or null when it is not a sensible amount. */
export function parseMoney(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const n = parseFloat(raw.replace(/[₪,\s]|ש"ח|שח/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return null;
  return Math.round(n * 100);
}
