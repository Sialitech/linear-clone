import { format, formatDistanceToNowStrict, startOfDay } from "date-fns";

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
