import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  toAltMode,
  type AltMode,
  type AssemblyManifest,
} from "../core/alt-theory-core.js";
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
 * What may happen to a conversation beyond this machine: a marker for a
 * future export filter, nothing more. Nothing is hidden, uploaded, or
 * deleted. (The hosted study's `"research"` / `"private"` vocabulary and its
 * 7-day deletion of private conversations were removed on 2026-09-26; an old
 * header's `"private"` still reads as withheld.)
 */
export type SessionVisibility = "exportable" | "no-export";

export function isSessionVisibility(value: unknown): value is SessionVisibility {
  return value === "exportable" || value === "no-export";
}

/** Whether this conversation is withheld from a research export. */
export function withholdsFromResearch(visibility: string | undefined): boolean {
  return visibility === "no-export" || visibility === "private";
}

export interface V4SessionHeader extends RecordEnvelope {
  recordType: "session";
  sessionId: string;
  createdAt: string;
  recordModel: "v0.4";
  visibility?: SessionVisibility;
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  };
  /** Recency before any prompt: creation, or an imported source's last update. */
  lastActivityAt?: string;
  /** Root Helper launch. Child Helpers use forkedFrom.purpose instead. */
  helper?: true;
  /** Per-session tool mode behind the permission control. */
  mode?: AltMode;
  /** Work/Native workspace (spec §5.1); absent = default session workspace only.
   *  v1.5.1: companion folders belong to the project in app settings; headers
   *  from before v1.5.1 may still carry a legacy `additionalDirs` field. */
  workspace?: {
    primaryDir: string;
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
  /** Full Access (M2, 2026-09-24): present only while on. Never copied to a
   *  child — branches, BTW, Helpers and subagents start without it. */
  fullAccess?: true;
  /** Smart approval (2026-09-26): present only while on. Children inherit it
   *  at birth when the parent had it or Full (the inheritance cap). */
  smartApproval?: true;
  /** Spawn-time preset snapshot; each fallback keeps its own thinking level. */
  subagentExecution?: {
    agentType: string;
    modelChain: SessionModelOverride[];
  };
  /**
   * A root that gave its list spot to a promoted child (v1.4 M4b role
   * swap). Stays a list member, displayed DEMOTED — nested under its
   * successor. Fork children delist via forkedFrom.listed=false instead.
   */
  delisted?: boolean;
  /** The session that took the spot — makes the display inversion deterministic. */
  delistedFor?: string;
  /** List label fallback: the visible branch's first user message, cut to
   *  32 characters. Derived; valid while `snippetLeafId` still names the
   *  branch leaf the transcript uses ("" = no run moved it yet). */
  snippet?: string;
  snippetLeafId?: string;
}

export function writeFoundationRecords(args: {
  sessionRoot: string;
  recordsDir: string;
  manifest: AssemblyManifest;
  visibility?: SessionVisibility;
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
  lastActivityAt?: string;
  helper?: boolean;
  mode?: AltMode;
  workspace?: {
    primaryDir: string;
  } | null;
  forkedFrom?: {
    sessionId: string;
    purpose: ForkPurpose;
  } | null;
  studyTag?: StudyTag | null;
  modelOverride?: SessionModelOverride | null;
  fullAccess?: boolean;
  smartApproval?: boolean;
  subagentExecution?: {
    agentType: string;
    modelChain: SessionModelOverride[];
  } | null;
}): { session: V4SessionHeader } {
  const createdAt = args.manifest.createdAt ?? new Date().toISOString();
  const session: V4SessionHeader = {
    schemaVersion: V4_SCHEMA_VERSION,
    recordType: "session",
    sessionId: args.manifest.sessionId,
    createdAt,
    recordModel: "v0.4",
    visibility: args.visibility ?? "no-export",
    ...(args.consentSnapshot
      ? { consentSnapshot: { ...args.consentSnapshot } }
      : {}),
    lastActivityAt: args.lastActivityAt ?? createdAt,
    ...(args.helper ? { helper: true } : {}),
    ...(args.mode ? { mode: args.mode } : {}),
    ...(args.workspace ? { workspace: { ...args.workspace } } : {}),
    ...(args.forkedFrom ? { forkedFrom: { ...args.forkedFrom } } : {}),
    ...(args.studyTag ? { studyTag: { ...args.studyTag } } : {}),
    ...(args.modelOverride ? { modelOverride: { ...args.modelOverride } } : {}),
    ...(args.fullAccess ? { fullAccess: true as const } : {}),
    ...(args.smartApproval ? { smartApproval: true as const } : {}),
    ...(args.subagentExecution
      ? {
          subagentExecution: {
            agentType: args.subagentExecution.agentType,
            modelChain: args.subagentExecution.modelChain.map((entry) => ({
              ...entry,
            })),
          },
        }
      : {}),
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
    // Retired values (pure/full, understand) read as work (owner 2026-09-25).
    if (header.mode) header.mode = toAltMode(header.mode);
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

/** Stores the derived snippet on the header file as it is on disk, without
 *  the read-time normalization of readV4SessionHeader. */
export function writeSessionSnippet(
  recordsDir: string,
  snippet: string,
  leafId: string,
): void {
  const path = join(recordsDir, "session.json");
  const raw = readJson<Record<string, unknown>>(path);
  if (raw?.recordType !== "session") return;
  writeJsonAtomic(path, { ...raw, snippet, snippetLeafId: leafId });
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}
