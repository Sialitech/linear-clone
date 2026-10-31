import { addDays, format, formatDistanceToNowStrict, startOfDay } from "date-fns";

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/^Uncaught Error:\s*/, "");
  }
  return "Something went wrong";
}

export function formatDue(timestamp: number) {
  return format(timestamp, "MMM d");
}

export function formatRelative(timestamp: number) {
  const ageMs = Date.now() - timestamp;
  if (ageMs < 1000 * 60 * 60 * 24 * 7) {
    return formatDistanceToNowStrict(timestamp, { addSuffix: true });
  }
  return format(timestamp, "MMM d");
}

export function isOverdue(timestamp: number, status: string) {
  if (status === "done") return false;
  return startOfDay(timestamp).getTime() < startOfDay(new Date()).getTime();
}

export function dateInputValue(timestamp: number | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dateInputToTimestamp(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getTime();
}

export function initials(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export function projectColor(key: string) {
  const palette = ["#5e6ad2", "#4cb782", "#f2c94c", "#f2994a", "#e56cd2", "#26b5ce"];
  let hash = 0;
  for (const char of key) hash = (hash + char.charCodeAt(0)) % palette.length;
  return palette[hash] ?? palette[0];
}

export function cycleValue<T>(values: readonly T[], current: T) {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length] ?? current;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

function dayStamp(date: Date) {
  return startOfDay(date).getTime();
}

export function formatMenuDate(timestamp: number) {
  return format(timestamp, "EEE, d MMM");
}

export function tomorrowTimestamp(now = new Date()) {
  return addDays(startOfDay(now), 1).getTime();
}

/** Friday of the current week. On Saturday or Sunday, the coming Friday. */
export function endOfThisWeekTimestamp(now = new Date()) {
  const delta = (5 - now.getDay() + 7) % 7;
  return addDays(startOfDay(now), delta).getTime();
}

export function inOneWeekTimestamp(now = new Date()) {
  return addDays(startOfDay(now), 7).getTime();
}

export function sameLocalDay(a: number | null, b: number | null) {
  if (a === null || b === null) return false;
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function monthIndex(token: string) {
  const value = token.toLowerCase();
  if (value.length < 3) return -1;
  return MONTHS.findIndex((month) => month.startsWith(value));
}

function stampNamedDate(year: number, month: number, day: number) {
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return dayStamp(date);
}

export function parseDueQuery(input: string, now = new Date()): number | null {
  const text = input.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!text) return null;
  if (text === "today") return dayStamp(now);
  if (text === "tomorrow") return tomorrowTimestamp(now);
  if (text === "next week" || text === "in one week" || text === "in a week" || text === "one week") {
    return inOneWeekTimestamp(now);
  }
  if (text === "end of this week" || text === "end of week" || text === "eow") {
    return endOfThisWeekTimestamp(now);
  }

  const relative = text.match(
    /^(?:in\s+)?(\d+)\s*(h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks)$/,
  );
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2] ?? "";
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (unit.startsWith("h")) {
      return addDays(startOfDay(now), Math.max(1, Math.ceil(amount / 24))).getTime();
    }
    if (unit.startsWith("w")) return addDays(startOfDay(now), amount * 7).getTime();
    return addDays(startOfDay(now), amount).getTime();
  }

  const dayFirst = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?$/);
  const monthFirst = text.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/);
  const named = dayFirst ?? monthFirst;
  if (named && named[1] && named[2]) {
    const leadingDay = Boolean(dayFirst);
    const day = Number(leadingDay ? named[1] : named[2]);
    const month = monthIndex(leadingDay ? named[2] : named[1]);
    const yearToken = named[3];
    if (month < 0 || day < 1 || day > 31) return null;
    const year = yearToken ? Number(yearToken) : now.getFullYear();
    const stamped = stampNamedDate(year, month, day);
    if (stamped === null) return null;
    if (!yearToken && stamped < dayStamp(now)) return stampNamedDate(year + 1, month, day);
    return stamped;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso?.[1] && iso[2] && iso[3]) {
    return stampNamedDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  return null;
}
