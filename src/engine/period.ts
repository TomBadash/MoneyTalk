import type { IsoDate } from "@/domain/types";

// Calendar-date arithmetic on "YYYY-MM-DD" strings, done in UTC so it is
// independent of the server's timezone. Israeli week starts on Sunday.

const MS = 86_400_000;
export const parse = (d: IsoDate) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
export const fmt = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: IsoDate, n: number): IsoDate => fmt(parse(d) + n * MS);
export const diffDays = (a: IsoDate, b: IsoDate) => Math.round((parse(a) - parse(b)) / MS);
export const weekday = (d: IsoDate) => new Date(parse(d)).getUTCDay(); // 0=Sun
/** Israeli weekend: Friday + Saturday. */
export const isWeekend = (d: IsoDate) => {
  const w = weekday(d);
  return w === 5 || w === 6;
};
export const monthKey = (d: IsoDate) => d.slice(0, 7);
export const monthStart = (d: IsoDate) => `${d.slice(0, 7)}-01`;
export const daysInMonth = (d: IsoDate) => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const monthEnd = (d: IsoDate) => `${d.slice(0, 7)}-${String(daysInMonth(d)).padStart(2, "0")}`;
export const addMonths = (d: IsoDate, n: number): IsoDate => {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const dim = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return fmt(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(day, dim)));
};
/** Sunday that starts the week containing d. */
export const weekStart = (d: IsoDate) => addDays(d, -weekday(d));
export const weekEnd = (d: IsoDate) => addDays(weekStart(d), 6);
export const inRange = (d: IsoDate, from: IsoDate, to: IsoDate) => d >= from && d <= to;
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
