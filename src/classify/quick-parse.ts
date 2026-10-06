import { toAgorot } from "@/engine/money";

export type QuickParsed = { description: string; amount: number | null; // agorot
  dateOffsetDays: number };

/**
 * "סלמון 62" / "סופר 214.50" / "62 סלמון" / "קפה 18 ₪" / "וולט 84 אתמול".
 * Picks the last standalone number as the amount (so "2 קפה 18" ⇒ amount 18, description "2 קפה").
 */
export function parseQuick(raw: string): QuickParsed {
  let text = raw.trim();
  let dateOffsetDays = 0;
  const day = text.match(/(^|\s)(אתמול|שלשום)(?=\s|$)/);
  if (day) { dateOffsetDays = day[2] === "אתמול" ? -1 : -2; text = text.replace(day[0], " "); }
  text = text.replace(/\s*(₪|ש"ח|שח|שקל(?:ים)?)\s*/g, " ");
  const nums = [...text.matchAll(/(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{1,2}))?(?![\d])/g)];
  if (nums.length === 0) return { description: text.replace(/\s+/g, " ").trim(), amount: null, dateOffsetDays };
  const m = nums[nums.length - 1];
  const intPart = m[1].replace(/,/g, "");
  const amount = toAgorot(parseFloat(m[2] ? `${intPart}.${m[2]}` : intPart));
  const description = (text.slice(0, m.index) + " " + text.slice(m.index! + m[0].length)).replace(/\s+/g, " ").trim();
  return { description, amount, dateOffsetDays };
}
