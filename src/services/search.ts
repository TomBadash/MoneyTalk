import type { Agorot, IsoDate, Txn } from "@/domain/types";
import { normalizeText, stem } from "@/classify/normalize";
import { nodeInfo } from "@/classify/taxonomy";
import { addDays, addMonths, daysInMonth, monthEnd, monthStart, weekStart } from "@/engine/period";

/** One filter model shared by search, analytics drill-down, the assistant's "Show Transactions" and URLs. */
export type TxnQuery = {
  text?: string[]; // all must match (merchant, description, product, category names)
  from?: IsoDate; to?: IsoDate;
  min?: Agorot; max?: Agorot;
  categoryId?: string; merchant?: string; productId?: string;
  review?: boolean;
};

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const monthIdx = (w: string) => {
  const n = normalizeText(w);
  for (const cand of [n, n.replace(/^[בלמו]/, "")]) { const i = MONTHS.findIndex((m) => normalizeText(m) === cand); if (i >= 0) return i; }
  return -1;
};

// words that carry no search meaning
const STOP = new Set(["ב", "של", "את", "עם", "כל", "ה", "על", "מ", "ל", "שקל", "שקלים", "ש\"ח", "בשקל"]);

/** Free text → structured filter. Anything not understood stays as text to match. */
export function parseSearch(q: string, today: IsoDate): TxnQuery {
  const out: TxnQuery = {};
  let rest = ` ${q.replace(/₪/g, " שקל ").replace(/[,]/g, "")} `;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => { const m = rest.match(re); if (m) { fn(m); rest = rest.replace(m[0], " "); } };

  take(/\s(?:מעל|יותר מ|גדול מ)-?\s*(\d+(?:\.\d+)?)\s*(?:שקל|שקלים)?/, (m) => { out.min = Math.round(parseFloat(m[1]) * 100); });
  take(/\s(?:מתחת ל|פחות מ|עד)-?\s*(\d+(?:\.\d+)?)\s*(?:שקל|שקלים)?/, (m) => { out.max = Math.round(parseFloat(m[1]) * 100); });

  take(/\sהחודש שעבר\s/, () => { const s = addMonths(monthStart(today), -1); out.from = s; out.to = monthEnd(s); });
  take(/\sהחודש\s/, () => { out.from = monthStart(today); out.to = monthEnd(today); });
  take(/\sהשבוע\s/, () => { out.from = weekStart(today); out.to = today; });
  take(/\s(?:השנה|מתחילת השנה)\s/, () => { out.from = `${today.slice(0, 4)}-01-01`; out.to = today; });
  take(/\sבשנה שעברה\s/, () => { const y = Number(today.slice(0, 4)) - 1; out.from = `${y}-01-01`; out.to = `${y}-12-31`; });
  take(/\sהיום\s/, () => { out.from = today; out.to = today; });
  take(/\sאתמול\s/, () => { const y = addDays(today, -1); out.from = y; out.to = y; });

  if (!out.from) {
    // "יולי 2026" | "ספטמבר" | "בספטמבר"
    const words = rest.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const mi = monthIdx(words[i]);
      if (mi < 0) continue;
      const next = words[i + 1];
      let year: number;
      if (next && /^(19|20)\d{2}$/.test(next)) { year = Number(next); words.splice(i, 2); }
      else { year = Number(today.slice(0, 4)); if (mi + 1 > Number(today.slice(5, 7))) year -= 1; words.splice(i, 1); }
      const s = `${year}-${String(mi + 1).padStart(2, "0")}-01`;
      out.from = s; out.to = `${year}-${String(mi + 1).padStart(2, "0")}-${String(daysInMonth(s)).padStart(2, "0")}`;
      rest = ` ${words.join(" ")} `;
      break;
    }
  }

  // a bare number is an exact-ish amount (e.g. "62")
  take(/\s(\d+(?:\.\d+)?)(?=\s|$)/, (m) => { const v = Math.round(parseFloat(m[1]) * 100); if (out.min == null && out.max == null) { out.min = v; out.max = v; } });

  const tokens = rest.split(/\s+/).map((w) => w.trim()).filter((w) => w && !STOP.has(w));
  if (tokens.length) out.text = tokens;
  return out;
}

const SYN: Record<string, string> = {
  s_clothing: "בגדים ביגוד", c_groceries: "סופר מכולת קניות מזון", s_delivery: "משלוח וולט wolt", s_coffee: "קפה coffee",
  c_eating_out: "אוכל בחוץ", s_fuel: "דלק בנזין", s_electronics: "אלקטרוניקה מחשב טלפון",
};

export type Lookups = { productName: (id?: string | null) => string };

/** Lower-cased haystack of everything searchable about a transaction. */
export function haystack(t: Txn, l: Lookups): string {
  const names = [t.subcategoryId, t.categoryId, t.parentCategoryId].map((id) => (id ? `${nodeInfo(id).he} ${SYN[id] ?? ""}` : "")).join(" ");
  return normalizeText(`${t.merchantRaw} ${t.descriptionRaw} ${l.productName(t.productId)} ${names} ${t.merchantNormalized}`);
}

export function matches(t: Txn, q: TxnQuery, l: Lookups): boolean {
  if (q.from && t.date < q.from) return false;
  if (q.to && t.date > q.to) return false;
  if (q.min != null && t.amount < q.min) return false;
  if (q.max != null && t.amount > q.max) return false;
  if (q.categoryId && ![t.categoryId, t.subcategoryId, t.parentCategoryId].includes(q.categoryId)) return false;
  if (q.merchant && t.merchantNormalized !== q.merchant) return false;
  if (q.productId && t.productId !== q.productId) return false;
  if (q.review && !t.needsReview) return false;
  if (q.text?.length) {
    const h = haystack(t, l);
    const hs = h.split(" ").map(stem).join(" ");
    for (const w of q.text) {
      const n = normalizeText(w);
      if (!h.includes(n) && !hs.includes(stem(n))) return false;
    }
  }
  return true;
}

/* URL (de)serialisation */
export function queryToParams(q: TxnQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.text?.length) p.set("q", q.text.join(" "));
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.min != null) p.set("min", String(q.min));
  if (q.max != null) p.set("max", String(q.max));
  if (q.categoryId) p.set("cat", q.categoryId);
  if (q.merchant) p.set("merchant", q.merchant);
  if (q.productId) p.set("product", q.productId);
  if (q.review) p.set("review", "1");
  return p;
}
const iso = /^\d{4}-\d{2}-\d{2}$/;
const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
/** Explicit params win; a free-text `q` is parsed for dates/amounts and merged. */
export function paramsToQuery(sp: Record<string, string | string[] | undefined>, today: IsoDate): TxnQuery {
  const g = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };
  const parsed = g("q") ? parseSearch(g("q")!, today) : {};
  const q: TxnQuery = { ...parsed };
  const f = g("from"), t = g("to");
  if (f && iso.test(f)) q.from = f;
  if (t && iso.test(t)) q.to = t;
  if (num(g("min")) != null) q.min = num(g("min"));
  if (num(g("max")) != null) q.max = num(g("max"));
  if (g("cat")) q.categoryId = g("cat");
  if (g("merchant")) q.merchant = g("merchant");
  if (g("product")) q.productId = g("product");
  if (g("review")) q.review = true;
  return q;
}
export const hrefFor = (q: TxnQuery, base = "/transactions") => { const s = queryToParams(q).toString(); return s ? `${base}?${s}` : base; };
