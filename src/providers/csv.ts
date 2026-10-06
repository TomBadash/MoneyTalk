import { createHash } from "node:crypto";
import type { ProviderTxn } from "./types";
import { toAgorot } from "@/engine/money";

/* CSV import — the always-available backup when no aggregator is connected. */

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const delim = (t.split("\n", 1)[0].match(/;/g)?.length ?? 0) > (t.split("\n", 1)[0].match(/,/g)?.length ?? 0) ? ";" : (t.split("\n", 1)[0].includes("\t") ? "\t" : ",");
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const H = {
  date: /(תאריך עסקה|תאריך רכישה|תאריך|date)/i,
  desc: /(שם בית עסק|בית עסק|תיאור|פרטים|description|merchant|details|payee)/i,
  amount: /(סכום חיוב|סכום עסקה|סכום|amount)/i,
  debit: /(חובה|debit|withdrawal)/i, credit: /(זכות|credit|deposit)/i,
};

export function parseDate(s: string): string | null {
  const v = s.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const d = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return Number.isNaN(Date.parse(d)) ? null : d;
}
const num = (s: string) => { const n = parseFloat(s.replace(/[₪,\s"']/g, "").replace(/^\((.*)\)$/, "-$1")); return Number.isFinite(n) ? n : null; };

export type CsvResult = { txns: ProviderTxn[]; skipped: number; error?: string };

/** Detect columns by header names (Hebrew/English), build provider txns with stable ids so re-imports dedupe. */
export function csvToTransactions(text: string, accountExternalId: string): CsvResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { txns: [], skipped: 0, error: "הקובץ ריק או לא בפורמט CSV." };
  const head = rows[0].map((h) => h.trim());
  const idx = (re: RegExp, not?: RegExp) => head.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const iDate = idx(H.date), iDesc = idx(H.desc), iDebit = idx(H.debit), iCredit = idx(H.credit);
  const iAmt = idx(H.amount, /יתרה|balance/i);
  if (iDate < 0 || iDesc < 0 || (iAmt < 0 && iDebit < 0 && iCredit < 0)) {
    return { txns: [], skipped: 0, error: "לא זיהינו את העמודות. נדרשות עמודות של תאריך, תיאור וסכום (או חובה/זכות)." };
  }
  const seen = new Map<string, number>(); const txns: ProviderTxn[] = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    const date = parseDate(r[iDate] ?? ""); const desc = (r[iDesc] ?? "").trim();
    let amount: number | null = null; let dir: "debit" | "credit" = "debit";
    if (iDebit >= 0 || iCredit >= 0) {
      const d = iDebit >= 0 ? num(r[iDebit] ?? "") : null, c = iCredit >= 0 ? num(r[iCredit] ?? "") : null;
      if (d) { amount = Math.abs(d); dir = "debit"; } else if (c) { amount = Math.abs(c); dir = "credit"; }
    } else { const a = iAmt >= 0 ? num(r[iAmt] ?? "") : null; if (a != null) { amount = Math.abs(a); dir = a < 0 ? "debit" : (iAmt >= 0 && /חיוב/.test(head[iAmt]) ? "debit" : "credit"); } }
    if (!date || !desc || !amount) { skipped++; continue; }
    const base = createHash("sha1").update(`${date}|${desc}|${amount}|${dir}`).digest("hex").slice(0, 16);
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n); // two identical purchases on one day stay two rows
    txns.push({ externalId: `csv-${base}-${n}`, accountExternalId, date, description: desc, merchant: desc, amount: toAgorot(amount), direction: dir });
  }
  return { txns, skipped, error: txns.length ? undefined : "לא נמצאו תנועות תקינות בקובץ." };
}
