import { createHash } from "crypto";
import {
  existsSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join, resolve } from "path";
import {
  parseSessionEntries,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  AssemblyManifest,
  AltMode,
} from "../core/alt-theory-core.js";
import { emptyFileRef } from "../core/agent-assets.js";
import {
  allocateReadableSessionId,
  createSessionDirs,
  resolveSessionsRoot,
  writeJsonAtomic,
} from "../core/data-dir.js";
import {
  writeFoundationRecords,
  type SessionVisibility,
} from "./session-records.js";
import {
  discoverOpenCodeSessions,
  preflightOpenCodeSession,
} from "./opencode-session-import.js";
import {
  discoverCodexSessions,
  preflightCodexSession,
} from "./codex-session-import.js";
import {
  discoverGrokSessions,
  fingerprintGrokSessionDir,
  preflightGrokSession,
} from "./grok-session-import.js";
import {
  discoverClaudeCodeSessions,
  preflightClaudeCodeSession,
} from "./claude-code-session-import.js";
import { ImportRefusalError } from "./session-import-shared.js";

export const IMPORT_HARNESSES = [
  "pi",
  "codex",
  "opencode",
  "grok-build",
  "claude-code",
] as const;

export type ImportHarness = (typeof IMPORT_HARNESSES)[number];

export interface ImportSourceSession {
  sourceId: string;
  sourceSessionId: string;
  name: string | null;
  cwd: string;
  cwdAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
  repeat: "new" | "unchanged" | "changed";
  importedSessionId: string | null;
  importCount: number;
  sourceStore?: string;
  sourceVersion?: string;
}

export interface ImportSourceRecord {
  schemaVersion: 1;
  recordType: "session-import-source";
  harness: ImportHarness;
  sourceStore: string;
  sourceId: string;
  sourceSessionId: string;
  sourceFingerprint: string;
  importedAt: string;
  sourceVersion?: string;
  transformations?: string[];
  sourceSnapshot?: string;
  sourceContext?: string;
  importOrdinal?: number;
}

/** Raw source listing before repeat classification; every harness maps here. */
export interface ImportDiscoveredSession {
  sourceId: string;
  sourceSessionId: string;
  sourceStore?: string;
  sourceVersion?: string;
  name: string | null;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

/** Prepared deterministic projection of one source session (ADR 0003). */
export interface ImportPreflight {
  piSessionJsonl: string;
  sourceFingerprint: string;
  sourceVersion?: string;
  transformations: string[];
  sourceContextFiles?: Array<{ filename: string; content: string }>;
}

interface ImportRegistrationCore {
  dataDir: string;
  source: ImportSourceSession;
  mode: AltMode;
  workspacePrimaryDir?: string;
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  rolePresetSlug?: string | null;
  soulSlug?: string | null;
  visibility?: SessionVisibility;
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
}

export type ImportRegistrationArgs = ImportRegistrationCore & {
  preflight: ImportPreflight;
};

export type ImportDiscoveryArgs = {
  harness: ImportHarness;
  dataDir: string;
  piSessionDir?: string;
  openCodeDbPath?: string;
  codexSessionsDir?: string;
  grokSessionsDir?: string;
  claudeCodeProjectsDir?: string;
};

/**
 * One harness, one adapter. Discovery dispatch, repeat classification,
 * preflight, registration, and the import alias all read from this shape;
 * the per-harness validate/project internals stay in each adapter module
 * per ADR 0003.
 */
export interface ImportAdapter {
  readonly harness: ImportHarness;
  /** English label used in the import alias. */
  readonly label: string;
  /** List raw source sessions for this harness. */
  discover(args: ImportDiscoveryArgs): Promise<ImportDiscoveredSession[]>;
  /** Whether a prior import record belongs to this discovered source. */
  matchesPrior(
    record: ImportSourceRecord,
    source: ImportDiscoveredSession,
  ): boolean;
  /**
   * Current revision id of a discovered source (store version or content
   * hash); compared with the prior record's revision to classify repeats.
   */
  fingerprint(source: ImportDiscoveredSession): string | undefined;
  /** Parse and verify the complete source before any managed write. */
  preflight(source: ImportSourceSession): ImportPreflight;
  /** Register a preflighted source as an ordinary managed session. */
  register(
    args: ImportRegistrationArgs,
  ): { sessionId: string; sourceFingerprint: string };
}

export class ImportHarnessNotImplementedError extends Error {
  constructor(readonly harness: string) {
    super(`Import adapter is not implemented for harness: ${harness}`);
  }
}

export function isImportHarness(value: string): value is ImportHarness {
  return (IMPORT_HARNESSES as readonly string[]).includes(value);
}

const piImportAdapter: ImportAdapter = {
  harness: "pi",
  label: "Pi",
  async discover(args) {
    const infos = args.piSessionDir
      ? await SessionManager.listAll(resolve(args.piSessionDir))
      : await SessionManager.listAll();
    return infos.map((info) => ({
      sourceId: resolve(info.path),
      sourceSessionId: info.id,
      name: info.name ?? null,
      cwd: info.cwd,
      createdAt: info.created.toISOString(),
      updatedAt: info.modified.toISOString(),
      messageCount: info.messageCount,
      preview: info.firstMessage.slice(0, 240),
    }));
  },
  matchesPrior(record, source) {
    return (
      record.sourceId === source.sourceId &&
      record.sourceSessionId === source.sourceSessionId
    );
  },
  fingerprint(source) {
    return fingerprintFile(source.sourceId);
  },
  preflight(source) {
    const sourcePath = resolve(source.sourceId);
    let piSessionJsonl: string;
    try {
      if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
        throw new Error(`source session is missing: ${sourcePath}`);
      }
      piSessionJsonl = readFileSync(sourcePath, "utf-8");
    } catch (error) {
      throw new ImportRefusalError(
        "Pi",
        "session-file",
        1,
        error instanceof Error ? error.message : String(error),
      );
    }
    // parseSessionEntries skips malformed lines, so a usable current tip
    // means a session header plus at least one entry survived parsing.
    const entries = parseSessionEntries(piSessionJsonl);
    if (
      !entries.some((entry) => entry.type === "session") ||
      !entries.some((entry) => entry.type !== "session")
    ) {
      throw new ImportRefusalError(
        "Pi",
        "session-entry",
        1,
        "source session has no parseable header and entries — the current tip is not identifiable",
      );
    }
    return {
      piSessionJsonl,
      sourceFingerprint: fingerprintFile(sourcePath),
      transformations: [],
    };
  },
  register({ preflight, source, ...core }) {
    const sourcePath = resolve(source.sourceId);
    return registerPreparedImport({
      ...core,
      source,
      harness: "pi",
      piSessionJsonl: preflight.piSessionJsonl,
      importedFilename: basename(sourcePath),
      sourceFingerprint: preflight.sourceFingerprint,
      sourceStore: dirname(sourcePath),
      transformations: [],
    });
  },
};

const codexImportAdapter: ImportAdapter = {
  harness: "codex",
  label: "Codex",
  discover(args) {
    return Promise.resolve(discoverCodexSessions(args.codexSessionsDir));
  },
  matchesPrior(record, source) {
    return record.sourceSessionId === source.sourceSessionId;
  },
  fingerprint(source) {
    return source.sourceVersion;
  },
  preflight(source) {
    return preflightCodexSession({
      sourceSessionId: source.sourceSessionId,
      sourceStore: source.sourceStore,
    });
  },
  register({ preflight, source, ...core }) {
    return registerPreparedImport({
      ...core,
      source,
      harness: "codex",
      piSessionJsonl: preflight.piSessionJsonl,
      importedFilename: `codex-${source.sourceSessionId}.jsonl`,
      sourceFingerprint: preflight.sourceFingerprint,
      sourceStore: source.sourceStore ?? "",
      sourceVersion: preflight.sourceVersion,
      transformations: preflight.transformations,
      sourceContextFiles: preflight.sourceContextFiles,
      rawSourceFile: source.sourceStore,
    });
  },
};

const openCodeImportAdapter: ImportAdapter = {
  harness: "opencode",
  label: "OpenCode",
  discover(args) {
    return Promise.resolve(discoverOpenCodeSessions(args.openCodeDbPath));
  },
  matchesPrior(record, source) {
    return record.sourceSessionId === source.sourceSessionId;
  },
  fingerprint(source) {
    return source.sourceVersion;
  },
  preflight(source) {
    return preflightOpenCodeSession({
      sourceSessionId: source.sourceSessionId,
      sourceStore: source.sourceStore,
    });
  },
  register({ preflight, source, ...core }) {
    return registerPreparedImport({
      ...core,
      source,
      harness: "opencode",
      piSessionJsonl: preflight.piSessionJsonl,
      importedFilename: `opencode-${source.sourceSessionId}.jsonl`,
      sourceFingerprint: preflight.sourceFingerprint,
      sourceStore: source.sourceStore ?? "",
      sourceVersion: preflight.sourceVersion,
      transformations: preflight.transformations,
      sourceContextFiles: preflight.sourceContextFiles,
    });
  },
};

const grokImportAdapter: ImportAdapter = {
  harness: "grok-build",
  label: "Grok Build",
  discover(args) {
    return Promise.resolve(discoverGrokSessions(args.grokSessionsDir));
  },
  matchesPrior(record, source) {
    return record.sourceSessionId === source.sourceSessionId;
  },
  fingerprint(source) {
    return source.sourceVersion;
  },
  preflight(source) {
    return preflightGrokSession({
      sourceSessionId: source.sourceSessionId,
      sourceStore: source.sourceStore,
    });
  },
  register({ preflight, source, ...core }) {
    return registerPreparedImport({
      ...core,
      source,
      harness: "grok-build",
      piSessionJsonl: preflight.piSessionJsonl,
      importedFilename: `grok-build-${source.sourceSessionId}.jsonl`,
      sourceFingerprint: preflight.sourceFingerprint,
      sourceStore: source.sourceStore ?? "",
      sourceVersion: preflight.sourceVersion,
      transformations: preflight.transformations,
      rawSourceDir: source.sourceStore,
    });
  },
};

const claudeCodeImportAdapter: ImportAdapter = {
  harness: "claude-code",
  label: "Claude Code",
  discover(args) {
    return Promise.resolve(
      discoverClaudeCodeSessions(args.claudeCodeProjectsDir),
    );
  },
  matchesPrior(record, source) {
    return record.sourceSessionId === source.sourceSessionId;
  },
  fingerprint(source) {
    return source.sourceVersion;
  },
  preflight(source) {
    return preflightClaudeCodeSession({
      sourceSessionId: source.sourceSessionId,
      sourceStore: source.sourceStore,
    });
  },
  register({ preflight, source, ...core }) {
    return registerPreparedImport({
      ...core,
      source,
      harness: "claude-code",
      piSessionJsonl: preflight.piSessionJsonl,
      importedFilename: `claude-code-${source.sourceSessionId}.jsonl`,
      sourceFingerprint: preflight.sourceFingerprint,
      sourceStore: source.sourceStore ?? "",
      sourceVersion: preflight.sourceVersion,
      transformations: preflight.transformations,
      sourceContextFiles: preflight.sourceContextFiles,
    });
  },
};

const importAdapters: Record<ImportHarness, ImportAdapter> = {
  pi: piImportAdapter,
  codex: codexImportAdapter,
  opencode: openCodeImportAdapter,
  "grok-build": grokImportAdapter,
  "claude-code": claudeCodeImportAdapter,
};

export function getImportAdapter(harness: ImportHarness): ImportAdapter {
  const adapter = importAdapters[harness];
  if (!adapter) {
    throw new ImportHarnessNotImplementedError(harness);
  }
  return adapter;
}

export async function discoverImportSessions(
  args: ImportDiscoveryArgs,
): Promise<ImportSourceSession[]> {
  const adapter = getImportAdapter(args.harness);
  const previous = readImportSourceRecords(args.dataDir);
  const discovered = await adapter.discover(args);
  return discovered.map((source) => {
    const priors = previous.filter(
      (candidate) =>
        candidate.record.harness === args.harness &&
        adapter.matchesPrior(candidate.record, source),
    );
    const prior = latestImport(priors);
    const priorRevision = prior
      ? (prior.record.sourceVersion ?? prior.record.sourceFingerprint)
      : undefined;
    const currentRevision = prior ? adapter.fingerprint(source) : undefined;
    return {
      ...source,
      cwdAvailable: isDirectory(source.cwd),
      repeat: !prior
        ? "new"
        : priorRevision === currentRevision
          ? "unchanged"
          : "changed",
      importedSessionId: prior?.sessionId ?? null,
      importCount: priors.length,
    };
  });
}

function registerPreparedImport(
  args: ImportRegistrationCore & {
    harness: ImportHarness;
    piSessionJsonl: string;
    importedFilename: string;
    sourceFingerprint: string;
    sourceStore: string;
    sourceVersion?: string;
    transformations: string[];
    sourceContextFiles?: Array<{ filename: string; content: string }>;
    rawSourceDir?: string;
    rawSourceFile?: string;
  },
): { sessionId: string; sourceFingerprint: string } {
  parseSessionEntries(args.piSessionJsonl);
  const workspacePrimaryDir = resolve(args.workspacePrimaryDir ?? args.source.cwd);
  if (!isDirectory(workspacePrimaryDir)) {
    throw new Error(
      `Imported session needs an existing workspace directory: ${workspacePrimaryDir}`
    );
  }

  // The complete prepared artifact was parsed before this managed write begins.
  const sessionId = allocateReadableSessionId(args.dataDir, {
    modelId: "imported-pi",
  });
  const dirs = createSessionDirs(args.dataDir, sessionId);
  const importedPath = join(dirs.piSessionDir, basename(args.importedFilename));
  try {
    writeFileSync(importedPath, args.piSessionJsonl);
    SessionManager.open(importedPath);
    let sourceSnapshot: string | undefined;
    if (args.rawSourceFile) {
      sourceSnapshot = "source-rollout.jsonl";
      const snapshotPath = join(dirs.recordsDir, sourceSnapshot);
      copyFileSync(resolve(args.rawSourceFile), snapshotPath);
      if (fingerprintFile(snapshotPath) !== args.sourceFingerprint) {
        throw new Error("Codex source changed while its managed snapshot was copied");
      }
    } else if (args.rawSourceDir) {
      sourceSnapshot = "source-snapshot";
      const snapshotPath = join(dirs.recordsDir, sourceSnapshot);
      cpSync(resolve(args.rawSourceDir), snapshotPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
        verbatimSymlinks: true,
      });
      if (fingerprintGrokSessionDir(snapshotPath) !== args.sourceFingerprint) {
        throw new Error("Grok source changed while its managed snapshot was copied");
      }
    }
    let sourceContext: string | undefined;
    if (args.sourceContextFiles?.length) {
      sourceContext = "source-context";
      const contextDir = join(dirs.recordsDir, sourceContext);
      mkdirSync(contextDir);
      for (const file of args.sourceContextFiles) {
        if (basename(file.filename) !== file.filename) {
          throw new Error(`Invalid source context filename: ${file.filename}`);
        }
        writeFileSync(join(contextDir, file.filename), file.content);
      }
    }

    const createdAt = args.source.createdAt;
    const empty = emptyFileRef();
    const manifest: AssemblyManifest = {
      sessionId,
      createdAt,
      openedFrom: "existing",
      appContext: empty,
      soul: { ...empty, slug: args.soulSlug ?? null },
      rolePreset: { ...empty, slug: args.rolePresetSlug ?? null },
      customInstruction: { ...empty, ref: null, optional: true },
      skills: [],
      piAdapter: {
        promptTemplatesDir: null,
        promptTemplatesExist: false,
      },
      kbDomain: "all",
      kb: {
        rootDir: "",
        domain: "all",
        domainPath: null,
        domainExists: true,
        metadata: null,
      },
      sessionCwd: workspacePrimaryDir,
      workspace: {
        primaryDir: workspacePrimaryDir,
        additionalDirs: [],
      },
      piSessionDir: dirs.piSessionDir,
      piSessionFile: importedPath,
      recordsDir: dirs.recordsDir,
      writeDir: dirs.writeDir,
      // Understand can write only inside the managed session workspace. Work
      // roots are rebuilt by the normal reopen path from workspace metadata.
      writableRoots:
        args.mode === "understand"
          ? [dirs.writeDir]
          : [dirs.writeDir, workspacePrimaryDir],
      model: null,
      provider: null,
      altMode: args.mode,
      resourceDiscovery: { mode: "clean", skillsDir: null },
      runLabel: null,
      testBatch: null,
    };
    writeJsonAtomic(join(dirs.recordsDir, "assembly-manifest.json"), manifest);
    writeFoundationRecords({
      sessionRoot: dirs.sessionRoot,
      recordsDir: dirs.recordsDir,
      manifest,
      ownerAccountId: args.ownerAccountId,
      roleCondition: args.roleCondition,
      visibility: args.visibility,
      consentSnapshot: args.consentSnapshot,
      lastActivityAt: args.source.updatedAt,
      mode: args.mode,
      workspace: manifest.workspace,
    });

    const importOrdinal = args.source.importCount + 1;
    const sourceRecord: ImportSourceRecord = {
      schemaVersion: 1,
      recordType: "session-import-source",
      harness: args.harness,
      sourceStore: args.sourceStore,
      sourceId: args.source.sourceId,
      sourceSessionId: args.source.sourceSessionId,
      sourceFingerprint: args.sourceFingerprint,
      sourceVersion: args.sourceVersion,
      transformations: args.transformations,
      sourceSnapshot,
      sourceContext,
      importOrdinal,
      importedAt: new Date().toISOString(),
    };
    writeJsonAtomic(
      join(dirs.recordsDir, "session-import-source.json"),
      sourceRecord
    );
    writeJsonAtomic(join(dirs.recordsDir, "ui-alias.json"), {
      schemaVersion: 1,
      alias: importAlias(
        args.source.name || args.source.preview || args.source.sourceSessionId,
        args.harness,
        importOrdinal,
        sourceRecord.importedAt
      ),
      updatedAt: sourceRecord.importedAt,
    });
    return { sessionId, sourceFingerprint: args.sourceFingerprint };
  } catch (error) {
    rmSync(dirs.sessionRoot, { recursive: true, force: true });
    throw error;
  }
}

function latestImport<T extends { record: ImportSourceRecord }>(
  records: T[]
): T | undefined {
  return [...records].sort((a, b) =>
    String(b.record.importedAt).localeCompare(String(a.record.importedAt))
  )[0];
}

function importAlias(
  sourceName: string,
  harness: ImportHarness,
  ordinal: number,
  importedAt: string
): string {
  const label = importAdapters[harness].label;
  const suffix = ` · ${label} import ${importedAt.slice(0, 10)} #${String(ordinal).padStart(2, "0")}`;
  const base = sourceName.trim().replace(/\s+/g, " ");
  return `${base.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
}

function fingerprintFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function isDirectory(path: string): boolean {
  if (!path || !existsSync(path)) return false;
  return statSync(path).isDirectory();
}

function readImportSourceRecords(dataDir: string): Array<{
  sessionId: string;
  record: ImportSourceRecord;
}> {
  const sessionsRoot = resolveSessionsRoot(dataDir);
  if (!existsSync(sessionsRoot)) return [];
  return readdirSync(sessionsRoot, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const path = join(
      sessionsRoot,
      entry.name,
      "records",
      "session-import-source.json"
    );
    if (!existsSync(path)) return [];
    try {
      const record = JSON.parse(readFileSync(path, "utf-8")) as ImportSourceRecord;
      return record.recordType === "session-import-source"
        ? [{ sessionId: entry.name, record }]
        : [];
    } catch {
      return [];
    }
  });
}
