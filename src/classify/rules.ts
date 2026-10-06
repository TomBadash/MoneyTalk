import { MERCHANTS, PRODUCTS, type MerchantEntry, type ProductEntry } from "./dictionary";
import { normalizeText, stem, tokens } from "./normalize";

export type MerchantHit = { entry: MerchantEntry; matched: string };
export type ProductHit = { entry: ProductEntry; matched: string; exact: boolean };

const mAlias = MERCHANTS.flatMap((e) => e.aliases.map((a) => ({ a: normalizeText(a), e })))
  .sort((x, y) => y.a.length - x.a.length);
const pKw = PRODUCTS.flatMap((e) => e.keywords.map((k) => ({ k: normalizeText(k), e })))
  .sort((x, y) => y.k.length - x.k.length);

const hasPhrase = (text: string, phrase: string) =>
  ` ${text} `.includes(` ${phrase} `) || (phrase.length >= 4 && ` ${text} `.includes(` ${phrase}`));

export function findMerchant(text: string): MerchantHit | null {
  const n = normalizeText(text);
  const stemmed = tokens(text).map(stem).join(" ");
  for (const { a, e } of mAlias) {
    if (hasPhrase(n, a) || hasPhrase(stemmed, a)) return { entry: e, matched: a };
  }
  return null;
}

/** Product keyword match; `exact` when the whole product phrase equals the keyword. */
export function findProduct(text: string, skip?: string): ProductHit | null {
  let n = normalizeText(text);
  if (skip) n = n.replace(skip, " ").replace(/\s+/g, " ").trim();
  const stemmed = tokens(n).map(stem).join(" ");
  for (const { k, e } of pKw) {
    if (n === k || stemmed === k) return { entry: e, matched: k, exact: true };
  }
  for (const { k, e } of pKw) {
    if (hasPhrase(n, k) || hasPhrase(stemmed, k)) return { entry: e, matched: k, exact: false };
  }
  return null;
}
