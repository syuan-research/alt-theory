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
export type ForkPurpose = "fork" | "side" | "helper" | "ab-arm" | "subagent";

/** Pre-M7 records used the original two purposes; normalize on read. */
const LEGACY_FORK_PURPOSE: Record<string, ForkPurpose> = {
  collaboration: "side",
  comparison: "ab-arm",
};

/**
 * v1-alpha records named the capability mode pure/full. The runtime indexes
 * per-mode maps by this value, so an un-normalized "pure" reopened as
 * `undefined` and took the whole session open down with it.
 */
const LEGACY_MODE: Record<string, "understand" | "work"> = {
  pure: "understand",
  full: "work",
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

/**
 * What happens to a conversation beyond this machine. TWO DISJOINT
 * VOCABULARIES, one per deployment — never mix them:
 *
 * - **hosted** (`ALT_THEORY_MODE=hosted`, the VPS study): `"research"` |
 *   `"private"`. `"private"` is the participant saying "don't keep this":
 *   researchers cannot read it, it is not exported, and it is hard-deleted
 *   after 7 inactive days. Deletion is HOW that promise is kept, not a side
 *   effect — a study account is not long-lived, so a private conversation
 *   that outlives the study would break the promise.
 * - **local** (the downloadable app): `"exportable"` | `"no-export"`. A
 *   marker for a future export filter, nothing more. Nothing is hidden,
 *   uploaded, or deleted, ever.
 *
 * A local install can never write `"private"`, so the retention sweeper
 * (`session-retention.ts`, hosted-only) can never match locally created
 * data. That is the fix for the defect where "local conversations default to
 * private" also meant "local conversations default to queued for deletion":
 * the safest-sounding default was the destructive one.
 */
export type SessionVisibility =
  | "research"
  | "private"
  | "exportable"
  | "no-export";

/** Vocabulary check — the guard that keeps the two deployments apart. */
export function isVisibilityForMode(
  visibility: string,
  localMode: boolean,
): visibility is SessionVisibility {
  return localMode
    ? visibility === "exportable" || visibility === "no-export"
    : visibility === "research" || visibility === "private";
}

/**
 * Whether this conversation is withheld from the research team. True for the
 * hosted `"private"` and the local `"no-export"`. Distinct from retention:
 * only `"private"` is ever deleted.
 */
export function withholdsFromResearch(
  visibility: SessionVisibility | undefined,
): boolean {
  return visibility === "private" || visibility === "no-export";
}

export interface V4SessionHeader extends RecordEnvelope {
  recordType: "session";
  sessionId: string;
  createdAt: string;
  projectId: string | null;
  recordModel: "v0.4";
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  visibility?: SessionVisibility;
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  };
  lastActivityAt?: string;
  retentionDueAt?: string | null;
  /** Per-session Alt Theory behavior mode. */
  mode?: "understand" | "work";
  /** Work/Native workspace (spec §5.1); absent = default session workspace only. */
  workspace?: {
    primaryDir: string;
    additionalDirs: string[];
  };
  /** Set on forked children (M5 substrate); absent = a root conversation. */
  forkedFrom?: {
    sessionId: string;
    purpose: ForkPurpose;
    /**
     * The user asked for this child to appear in the conversation list
     * (alpha.6). The purpose is KEPT so the list can still say where it came
     * from — a subagent that earned a place in the list is not a branch.
     */
    listed?: boolean;
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
  visibility?: SessionVisibility;
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
  lastActivityAt?: string;
  retentionDueAt?: string | null;
  mode?: "understand" | "work";
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
    if (header.mode) {
      header.mode = LEGACY_MODE[header.mode] ?? header.mode;
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
