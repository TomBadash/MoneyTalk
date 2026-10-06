// Israeli localization helpers (PRD §2.3): ₪ currency, DD/MM/YYYY, 24h, Hebrew names.

const numFmt = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const numFmt2 = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₪4,250" — integers without decimals, otherwise 2 digits. Symbol leads (matches mockups). */
export function formatMoney(amount: number): string {
  const isInt = Number.isInteger(amount);
  return `₪${(isInt ? numFmt : numFmt2).format(amount)}`;
}

/** Plain grouped number, no symbol. */
export function formatNumber(n: number): string {
  return numFmt.format(n);
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function toDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

/** DD/MM/YYYY */
export function formatDate(d: Date | string): string {
  const date = toDate(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** DD/MM */
export function formatDayMonth(d: Date | string): string {
  const date = toDate(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/** 24h HH:mm */
export function formatTime(d: Date | string): string {
  const date = toDate(d);
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}

const HE_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export function hebrewMonth(monthIndex: number): string {
  return HE_MONTHS[((monthIndex % 12) + 12) % 12];
}

/** "היום" / "אתמול" / "DD/MM" for grouping headers. */
export function relativeDayLabel(d: Date | string): string {
  const date = toDate(d);
  const today = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return "היום";
  if (diffDays === 1) return "אתמול";
  return formatDayMonth(date);
}

/** Integer agorot → "₪1,234" (whole shekels) or "₪1,234.50" when `exact`. */
export function formatAgorot(a: number, exact = false): string {
  const neg = a < 0 ? "-" : "";
  const v = Math.abs(a) / 100;
  if (!exact) return `${neg}₪${numFmt.format(Math.round(v))}`;
  return `${neg}${formatMoney(v)}`;
}

/** "+8%" / "-12%" */
export function formatSignedPercent(ratio: number): string {
  const p = Math.round(ratio * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

/** ISO "YYYY-MM-DD" → DD/MM/YYYY without timezone surprises. */
export function formatIso(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}
export function formatIsoShort(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** ISO timestamp → "DD/MM HH:mm" in Israel time. */
export function formatDateTimeIL(iso: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}
