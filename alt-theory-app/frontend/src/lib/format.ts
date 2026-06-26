import type { SessionSummary } from "@/api/types";
import { KB_OFF_VALUE } from "./constants";

export function displayKb(value: string | null | undefined): string {
  if (value === KB_OFF_VALUE) return "Off";
  return value || "—";
}

export function displaySlug(value: string | null | undefined): string {
  return value || "none";
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

export function isInterruptedError(error: string): boolean {
  return /aborted|abort|interrupted/i.test(error || "");
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