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
