import type { AccountRow, Budget, IsoDate, Profile } from "@/domain/types";
import type { Draft } from "@/services/ingest";
import { addDays, addMonths, daysInMonth, isWeekend, monthKey, monthStart, weekday } from "@/engine/period";

// Realistic, deterministic sample data for a salaried single renter in Tel Aviv.
// Amounts are in agorot. The same seed always yields the same history for a given date.

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_ACCOUNTS: AccountRow[] = [
  { id: "demo-bank", kind: "bank", institution: "בנק לאומי", name: "עו״ש", balance: 2_134_000, lastSync: null, status: "active" },
  { id: "demo-card", kind: "credit_card", institution: "ויזה כאל", name: "כרטיס אשראי •• 4821", balance: null, lastSync: null, status: "active" },
  { id: "demo-cash", kind: "cash", institution: "מזומן", name: "מזומן", balance: 45_000, lastSync: null, status: "active" },
];

export const DEMO_PROFILE: Profile & { onboarded: boolean; displayName: string } = {
  monthlyIncome: 2_150_000, monthlyRent: 650_000, monthlySavingsTarget: 300_000, monthlyInvestmentTarget: 250_000,
  variableTarget: 550_000, onboarded: true, displayName: "אלון",
};

export const DEMO_BUDGETS: Budget[] = [
  { categoryId: null, amount: 550_000 },
  { categoryId: "c_eating_out", amount: 90_000 },
  { categoryId: "c_groceries", amount: 190_000 },
  { categoryId: "c_delivery", amount: 60_000 },
];

const sh = (n: number) => Math.round(n * 100);

/** All demo drafts from 12 months back through `today` (inclusive). */
export function generateDemoDrafts(today: IsoDate): Draft[] {
  const r = rng(20260101);
  const between = (a: number, b: number) => a + r() * (b - a);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const start = addMonths(monthStart(today), -12);
  const thisMonth = monthKey(today);
  const out: Draft[] = [];
  const card = (d: IsoDate, merchant: string, amount: number, extra: Partial<Draft> = {}) =>
    out.push({ date: d, merchant, description: `${merchant} ת"א`, amount: sh(amount), source: "demo", accountId: "demo-card", paymentMethod: "card", externalId: `c-${out.length}`, ...extra });
  const bank = (d: IsoDate, merchant: string, description: string, amount: number, extra: Partial<Draft> = {}) =>
    out.push({ date: d, merchant, description, amount: sh(amount), source: "demo", accountId: "demo-bank", paymentMethod: "bank", externalId: `b-${out.length}`, ...extra });
  const manual = (d: IsoDate, description: string, amount: number) =>
    out.push({ date: d, description, amount: sh(amount), source: "manual" });

  const sixAgo = addMonths(monthStart(today), -2);
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const dom = Number(d.slice(8, 10));
    const m = Number(d.slice(5, 7));
    const mk = monthKey(d);
    const weekend = isWeekend(d);
    const dow = weekday(d);

    // ── fixed / recurring ──
    if (dom === 1) bank(d, "העברה לבעל הדירה", "שכר דירה", 6500);
    if (dom === 5) bank(d, "בזק", "בזק - אינטרנט סיבים", 109);
    if (dom === 7) bank(d, "פרטנר", "פרטנר - חבילה חודשית", 54);
    if (dom === 9) bank(d, "משכורת", "משכורת - הייטק בע\"מ", 21500, { direction: "credit", forceFinancialType: "income" });
    if (dom === 10) card(d, "הולמס פלייס", 285);
    if (dom === 11) bank(d, "אקסלנס", "אקסלנס - הפקדה להשקעות", 2500);
    if (dom === 11) bank(d, "העברה לחיסכון", "הפקדה לחיסכון", 3000);
    if (dom === 12) bank(d, "הראל", "הראל ביטוח בריאות", 186);
    if (dom === 3) card(d, "Spotify", mk >= monthKey(addMonths(monthStart(today), -1)) ? 21.9 : 19.9);
    if (dom === 14) card(d, "Netflix", 49.9);
    if (dom === 18 && d >= sixAgo) card(d, "Disney+", 29.9);
    if (dom === 15 && m % 2 === 1) bank(d, "עיריית תל אביב", "עיריית תל אביב - ארנונה", 780);
    if (dom === 20 && m % 2 === 0) bank(d, "חברת החשמל", "חברת החשמל - חשבון", Math.round(between(260, 430)));
    if (dom === 25 && m % 2 === 1) bank(d, "מי אביבים", "מי אביבים - חשבון מים", Math.round(between(90, 145)));
    if (dom === 22) bank(d, "ועד בית", "ועד בית - תשלום חודשי", 120);

    // ── supermarket (Sun–Fri) ──
    if (dow !== 6 && r() < 0.31) card(d, pick(["שופרסל דיל", "שופרסל דיל", "רמי לוי", "AM:PM", "יוחננוף"]), Math.round(between(55, 330)));
    // ── Wolt / restaurants / coffee / bars ──
    if (r() < (weekend ? 0.32 : 0.12)) card(d, "וולט", Math.round(between(52, 125)));
    const restRate = (mk === thisMonth ? 0.34 : 0.17) * (weekend ? 1.9 : 0.55);
    if (r() < restRate) out.push({ date: d, merchant: `מסעדת ${pick(["נונו", "הדסה", "מימון", "בית הקפה של דליה", "סבידה"])}`, description: "מסעדה", amount: sh(between(95, 260)), source: "demo", accountId: "demo-card", paymentMethod: "card", externalId: `c-${out.length}` });
    if (weekend && r() < 0.16) out.push({ date: d, merchant: "בר שכונתי", description: "בירה וקוקטייל", amount: sh(between(60, 190)), source: "demo", accountId: "demo-card", paymentMethod: "card", externalId: `c-${out.length}` });
    if (!weekend && r() < 0.16) card(d, pick(["ארומה", "קפה גרג"]), Math.round(between(15, 26)));
    // manual quick-adds (build product memory); coffee price drifts up through the year
    const yearsIn = (Date.parse(d) - Date.parse(start)) / (365 * 86_400_000);
    if (!weekend && r() < 0.42) manual(d, "קפה", Math.round((15 + 3 * yearsIn + between(-0.8, 1.2)) * 10) / 10);
    if (dow === 4 && r() < 0.62) manual(d, "סלמון", Math.round(52 + 10 * yearsIn + between(-2, 3)));
    // ── transport ──
    if (dom % 14 === 6) card(d, pick(["פז", "סונול"]), Math.round(between(245, 325)));
    if (r() < 0.07) card(d, "פנגו", Math.round(between(18, 55)));
    if (r() < 0.07) card(d, "גט", Math.round(between(32, 72)));
    // ── lifestyle ──
    if (dom === 8 || dom === 23) { if (r() < 0.55) card(d, pick(["זארה", "קסטרו", "H&M"]), Math.round(between(120, 460))); }
    if (r() < 0.035) card(d, "סינמה סיטי", Math.round(between(45, 130)));
    if (r() < 0.035) card(d, "סופר פארם", Math.round(between(32, 125)));
    if (dom === 20 && d >= addMonths(monthStart(today), -4) && d <= addMonths(monthStart(today), 1)) {
      // KSP laptop: ₪6,000 in 6 installments, first one 4 months ago
      const n = (Number(mk.slice(0, 4)) * 12 + m) - (Number(addMonths(monthStart(today), -4).slice(0, 4)) * 12 + Number(addMonths(monthStart(today), -4).slice(5, 7))) + 1;
      if (n >= 1 && n <= 6) card(d, "KSP", 1000, { description: "KSP - מחשב נייד", installmentNumber: n, installmentTotal: 6 });
    }
  }
  // one-offs
  const flight = addDays(today, -135), ikea = addDays(today, -75);
  if (flight >= start) card(flight, "אל על", 1850, { description: "אל על - טיסה לברצלונה" });
  if (ikea >= start) card(ikea, "איקאה", 1240, { description: "איקאה - ריהוט" });
  // unknown merchants → land in the Review Queue
  card(addDays(today, -2), "DELI 24 TLV", 42);
  card(addDays(today, -4), "PAYBOX - יוסי כהן", 120);
  card(addDays(today, -6), "מאפיית לחם ושות'", 38);

  // monthly credit-card statement paid from the bank (must NOT count as spending)
  const cardByMonth = new Map<string, number>();
  for (const d of out) if (d.accountId === "demo-card") cardByMonth.set(d.date.slice(0, 7), (cardByMonth.get(d.date.slice(0, 7)) ?? 0) + d.amount);
  for (const [mk, amt] of cardByMonth) {
    const pay = `${monthKey(addMonths(`${mk}-01`, 1))}-02`;
    if (pay <= today) bank(pay, "ויזה כאל", "ויזה כאל - חיוב כרטיס אשראי", amt / 100);
  }
  void daysInMonth;
  return out.filter((d) => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));
}
