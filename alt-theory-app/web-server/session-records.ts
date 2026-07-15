import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import type { AssemblyManifest } from "../core/alt-theory-core.js";
import { writeJsonAtomic } from "../core/data-dir.js";

export const V4_SCHEMA_VERSION = 1;

export interface RecordEnvelope {
  schemaVersion: 1;
  recordType: string;
}

export interface V4SessionHeader extends RecordEnvelope {
  recordType: "session";
  sessionId: string;
  createdAt: string;
  projectId: string | null;
  recordModel: "v0.4";
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  visibility?: "research" | "private";
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  };
  lastActivityAt?: string;
  retentionDueAt?: string | null;
  /** Capability mode (spec §4); absent = pure (all pre-v1-alpha sessions). */
  mode?: "pure" | "full";
}

export function writeFoundationRecords(args: {
  sessionRoot: string;
  recordsDir: string;
  manifest: AssemblyManifest;
  projectId?: string | null;
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  visibility?: "research" | "private";
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
  lastActivityAt?: string;
  retentionDueAt?: string | null;
  mode?: "pure" | "full";
}): { session: V4SessionHeader } {
  const createdAt = args.manifest.createdAt ?? new Date().toISOString();
  const session: V4SessionHeader = {
    schemaVersion: V4_SCHEMA_VERSION,
    recordType: "session",
    sessionId: args.manifest.sessionId,
    createdAt,
    projectId: args.projectId ?? null,
    recordModel: "v0.4",
    ownerAccountId: args.ownerAccountId ?? null,
    roleCondition: args.roleCondition ?? null,
    visibility: args.visibility ?? "research",
    ...(args.consentSnapshot
      ? { consentSnapshot: { ...args.consentSnapshot } }
      : {}),
    lastActivityAt: args.lastActivityAt ?? createdAt,
    retentionDueAt: args.retentionDueAt ?? null,
    ...(args.mode ? { mode: args.mode } : {}),
  };

  writeJsonAtomic(join(args.recordsDir, "session.json"), session);
  return { session };
}

export function resolveMainWorkspace(sessionRoot: string): string {
  return resolve(sessionRoot, "workspace");
}

export function readV4SessionHeader(recordsDir: string): V4SessionHeader | null {
  const path = join(recordsDir, "session.json");
  const header = readJson<V4SessionHeader>(path);
  if (
    header?.schemaVersion === V4_SCHEMA_VERSION &&
    header.recordType === "session"
  ) {
    return header;
  }
  return null;
}

export function writeSessionHeader(
  recordsDir: string,
  session: V4SessionHeader
): void {
  writeJsonAtomic(join(recordsDir, "session.json"), session);
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}
