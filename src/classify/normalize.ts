/** Normalise free-text merchant/description for matching. Raw text is never overwritten elsewhere. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'`״׳‎‏]/g, "")
    .replace(/[:;,.()\-_/\\*#@!?]+/g, " ")
    .replace(/₪|ש"ח|שח|nis|ils/g, " ")
    .replace(/\bסניף\b\s*\d*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip Hebrew one-letter prefixes (ה, ב, ל, ו, מ, ש) that stick to nouns: "הקפה" → "קפה". */
export function stem(w: string): string {
  return /^[הבלומש][א-ת]{3,}$/.test(w) ? w.slice(1) : w;
}

export const tokens = (s: string) => normalizeText(s).split(" ").filter(Boolean);
