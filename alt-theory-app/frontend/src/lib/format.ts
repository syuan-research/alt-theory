import type { SessionSummary } from "@/api/types";
import { t } from "@/i18n";
import { KB_OFF_VALUE } from "./constants";

export function displayKb(value: string | null | undefined): string {
  if (value === KB_OFF_VALUE) return t("Off");
  return value || "—";
}

export function displaySlug(value: string | null | undefined): string {
  return value || t("none");
}

export function shortId(sessionId: string): string {
  if (!sessionId) return "—";
  return sessionId.length > 12 ? `${sessionId.slice(0, 8)}…` : sessionId;
}

export function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Conversational last-edited label for session rows (owner 2026-09-25):
 * minutes/hours/days, then calendar-complete weeks (only ever 1-4), months
 * (1-12), years — mirroring how people speak; no 5-week or 13-month steps
 * because month and year boundaries use complete calendar units.
 */
export function relativeTimeLabel(
  value: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  const ms = Math.max(now - then, 0);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t("Just now");
  if (minutes < 60) return t("{count} minutes ago", { count: minutes });
  if (minutes < 60 * 24) return t("{count} hours ago", { count: Math.floor(minutes / 60) });
  const start = new Date(then);
  const end = new Date(now);
  const months = completeMonths(start, end);
  if (months < 1) {
    const days = Math.floor(ms / 86_400_000);
    if (days < 7) return t("{count} days ago", { count: days });
    return t("{count} weeks ago", { count: Math.floor(days / 7) });
  }
  if (months < 12) return t("{count} months ago", { count: months });
  return t("{count} years ago", { count: completeYears(start, end) });
}

/** Whole calendar months between start and end: the probe clamps overflows
 * (Jan 31 + 1 month lands on Mar 1) back to the last fully elapsed month. */
function completeMonths(start: Date, end: Date): number {
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const probe = new Date(start);
  probe.setMonth(start.getMonth() + months);
  if (probe.getTime() > end.getTime()) months -= 1;
  return Math.max(months, 0);
}

function completeYears(start: Date, end: Date): number {
  let years = end.getFullYear() - start.getFullYear();
  const probe = new Date(start);
  probe.setFullYear(start.getFullYear() + years);
  if (probe.getTime() > end.getTime()) years -= 1;
  return Math.max(years, 0);
}

export function formatCountLabel(
  count: number | null | undefined,
  singular: string,
  plural: string
): string {
  if (count == null) return "";
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatProviderModel(session: SessionSummary): string {
  const provider = session.provider || "";
  const model = session.model || "";
  if (provider && model) return `${provider}/${model}`;
  return provider || model || "";
}


export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString();
}

export function formatCost(cost: number | null | undefined): string {
  if (cost == null || !Number.isFinite(cost)) return "—";
  return `$${cost.toFixed(4)}`;
}

export function collapsePath(path: string): string {
  if (path.length <= 48) return path;
  const head = path.slice(0, 20);
  const tail = path.slice(-24);
  return `${head}…${tail}`;
}