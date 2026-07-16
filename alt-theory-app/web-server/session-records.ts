import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AssemblyManifest } from "../core/alt-theory-core.js";
import { writeJsonAtomic } from "../core/data-dir.js";

export const V4_SCHEMA_VERSION = 1;

/**
 * Child-session kind (M7 decision doc §3). Session-list membership derives
 * from it: only roots and "fork" appear in the list; a chosen A/B arm is
 * rewritten to "fork" when it becomes the continuation.
 */
export type ForkPurpose = "fork" | "side" | "helper" | "ab-arm";

/** Pre-M7 records used the original two purposes; normalize on read. */
const LEGACY_FORK_PURPOSE: Record<string, ForkPurpose> = {
  collaboration: "side",
  comparison: "ab-arm",
};

/** Study designation, session level (M7 decision doc §3); absent = daily use. */
export interface StudyTag {
  studyId: string;
  batch?: string;
}

/** Per-session model choice; absent = deployment-global model config. */
export interface SessionModelOverride {
  provider: string;
  modelId: string;
  thinkingLevel?: ThinkingLevel;
}

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
  /** Full workspace (spec §5.1); absent = default session workspace only. */
  workspace?: {
    primaryDir: string;
    additionalDirs: string[];
  };
  /** Set on forked children (M5 substrate); absent = a root conversation. */
  forkedFrom?: {
    sessionId: string;
    purpose: ForkPurpose;
  };
  studyTag?: StudyTag;
  modelOverride?: SessionModelOverride;
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
  workspace?: {
    primaryDir: string;
    additionalDirs: string[];
  } | null;
  forkedFrom?: {
    sessionId: string;
    purpose: ForkPurpose;
  } | null;
  studyTag?: StudyTag | null;
  modelOverride?: SessionModelOverride | null;
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
    ...(args.workspace ? { workspace: { ...args.workspace } } : {}),
    ...(args.forkedFrom ? { forkedFrom: { ...args.forkedFrom } } : {}),
    ...(args.studyTag ? { studyTag: { ...args.studyTag } } : {}),
    ...(args.modelOverride ? { modelOverride: { ...args.modelOverride } } : {}),
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
    if (header.forkedFrom) {
      header.forkedFrom.purpose =
        LEGACY_FORK_PURPOSE[header.forkedFrom.purpose] ??
        header.forkedFrom.purpose;
    }
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
