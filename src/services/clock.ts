import type { IsoDate } from "@/domain/types";

/** Today's calendar date in Israel — all period logic uses wall-clock dates, never server-local time. */
export function todayIsrael(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
