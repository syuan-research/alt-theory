import { createHash } from "crypto";
import {
  existsSync,
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
  CapabilityMode,
} from "../core/alt-theory-core.js";
import { emptyFileRef } from "../core/agent-assets.js";
import {
  allocateReadableSessionId,
  createSessionDirs,
  resolveSessionsRoot,
  writeJsonAtomic,
} from "../core/data-dir.js";
import { writeFoundationRecords } from "./session-records.js";
import {
  discoverOpenCodeSessions,
  preflightOpenCodeSession,
  type OpenCodePreflight,
} from "./opencode-session-import.js";
import {
  discoverCodexSessions,
  preflightCodexSession,
  type CodexPreflight,
} from "./codex-session-import.js";
import {
  discoverGrokSessions,
  fingerprintGrokSessionDir,
  preflightGrokSession,
  type GrokPreflight,
} from "./grok-session-import.js";

export const IMPORT_HARNESSES = [
  "pi",
  "codex",
  "opencode",
  "grok-build",
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

export class ImportHarnessNotImplementedError extends Error {
  constructor(readonly harness: string) {
    super(`Import adapter is not implemented for harness: ${harness}`);
  }
}

export function isImportHarness(value: string): value is ImportHarness {
  return (IMPORT_HARNESSES as readonly string[]).includes(value);
}

export async function discoverImportSessions(args: {
  harness: ImportHarness;
  dataDir: string;
  piSessionDir?: string;
  openCodeDbPath?: string;
  codexSessionsDir?: string;
  grokSessionsDir?: string;
}): Promise<ImportSourceSession[]> {
  if (
    args.harness === "opencode" ||
    args.harness === "codex" ||
    args.harness === "grok-build"
  ) {
    const previous = readImportSourceRecords(args.dataDir);
    const discovered = args.harness === "opencode"
      ? discoverOpenCodeSessions(args.openCodeDbPath)
      : args.harness === "codex"
        ? discoverCodexSessions(args.codexSessionsDir)
        : discoverGrokSessions(args.grokSessionsDir);
    return discovered.map((source) => {
      const priors = previous.filter(
        (candidate) =>
          candidate.record.harness === args.harness &&
          candidate.record.sourceSessionId === source.sourceSessionId
      );
      const prior = latestImport(priors);
      return {
        ...source,
        cwdAvailable: isDirectory(source.cwd),
        repeat: !prior
          ? "new"
          : prior.record.sourceVersion === source.sourceVersion
            ? "unchanged"
            : "changed",
        importedSessionId: prior?.sessionId ?? null,
        importCount: priors.length,
      };
    });
  }
  requirePiAdapter(args.harness);
  const infos = args.piSessionDir
    ? await SessionManager.listAll(resolve(args.piSessionDir))
    : await SessionManager.listAll();
  const previous = readImportSourceRecords(args.dataDir);

  return infos.map((info) => {
    const sourceId = resolve(info.path);
    const priors = previous.filter(
      (candidate) =>
        candidate.record.harness === "pi" &&
        candidate.record.sourceId === sourceId &&
        candidate.record.sourceSessionId === info.id
    );
    const prior = latestImport(priors);
    const currentFingerprint = prior ? fingerprintFile(sourceId) : null;
    return {
      sourceId,
      sourceSessionId: info.id,
      name: info.name ?? null,
      cwd: info.cwd,
      cwdAvailable: isDirectory(info.cwd),
      createdAt: info.created.toISOString(),
      updatedAt: info.modified.toISOString(),
      messageCount: info.messageCount,
      preview: info.firstMessage.slice(0, 240),
      repeat: !prior
        ? "new"
        : prior.record.sourceFingerprint === currentFingerprint
          ? "unchanged"
          : "changed",
      importedSessionId: prior?.sessionId ?? null,
      importCount: priors.length,
    };
  });
}

export function registerPiImport(args: {
  dataDir: string;
  source: ImportSourceSession;
  mode: CapabilityMode;
  workspacePrimaryDir?: string;
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  rolePresetSlug?: string | null;
  soulSlug?: string | null;
  visibility?: "research" | "private";
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
}): { sessionId: string; sourceFingerprint: string } {
  const sourcePath = resolve(args.source.sourceId);
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    throw new Error(`Pi source session is missing: ${sourcePath}`);
  }
  const piSessionJsonl = readFileSync(sourcePath, "utf-8");
  parseSessionEntries(piSessionJsonl);
  return registerPreparedImport({
    ...args,
    harness: "pi",
    piSessionJsonl,
    importedFilename: basename(sourcePath),
    sourceFingerprint: fingerprintFile(sourcePath),
    sourceStore: dirname(sourcePath),
    transformations: [],
  });
}

export function preflightOpenCodeImport(source: ImportSourceSession): OpenCodePreflight {
  return preflightOpenCodeSession({
    sourceSessionId: source.sourceSessionId,
    sourceStore: source.sourceStore,
  });
}

export function preflightCodexImport(source: ImportSourceSession): CodexPreflight {
  return preflightCodexSession({
    sourceSessionId: source.sourceSessionId,
    sourceStore: source.sourceStore,
  });
}

export function preflightGrokImport(source: ImportSourceSession): GrokPreflight {
  return preflightGrokSession({
    sourceSessionId: source.sourceSessionId,
    sourceStore: source.sourceStore,
  });
}

export function registerOpenCodeImport(args: {
  dataDir: string;
  source: ImportSourceSession;
  preflight: OpenCodePreflight;
  mode: CapabilityMode;
  workspacePrimaryDir?: string;
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  rolePresetSlug?: string | null;
  soulSlug?: string | null;
  visibility?: "research" | "private";
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
}): { sessionId: string; sourceFingerprint: string } {
  return registerPreparedImport({
    ...args,
    harness: "opencode",
    piSessionJsonl: args.preflight.piSessionJsonl,
    importedFilename: `opencode-${args.source.sourceSessionId}.jsonl`,
    sourceFingerprint: args.preflight.sourceFingerprint,
    sourceStore: args.source.sourceStore ?? "",
    sourceVersion: args.preflight.sourceVersion,
    transformations: args.preflight.transformations,
    sourceContextFiles: args.preflight.sourceContextFiles,
  });
}

export function registerCodexImport(args: {
  dataDir: string;
  source: ImportSourceSession;
  preflight: CodexPreflight;
  mode: CapabilityMode;
  workspacePrimaryDir?: string;
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  rolePresetSlug?: string | null;
  soulSlug?: string | null;
  visibility?: "research" | "private";
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
}): { sessionId: string; sourceFingerprint: string } {
  return registerPreparedImport({
    ...args,
    harness: "codex",
    piSessionJsonl: args.preflight.piSessionJsonl,
    importedFilename: `codex-${args.source.sourceSessionId}.jsonl`,
    sourceFingerprint: args.preflight.sourceFingerprint,
    sourceStore: args.source.sourceStore ?? "",
    sourceVersion: args.preflight.sourceVersion,
    transformations: args.preflight.transformations,
    sourceContextFiles: args.preflight.sourceContextFiles,
  });
}

export function registerGrokImport(args: {
  dataDir: string;
  source: ImportSourceSession;
  preflight: GrokPreflight;
  mode: CapabilityMode;
  workspacePrimaryDir?: string;
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  rolePresetSlug?: string | null;
  soulSlug?: string | null;
  visibility?: "research" | "private";
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
}): { sessionId: string; sourceFingerprint: string } {
  return registerPreparedImport({
    ...args,
    harness: "grok-build",
    piSessionJsonl: args.preflight.piSessionJsonl,
    importedFilename: `grok-build-${args.source.sourceSessionId}.jsonl`,
    sourceFingerprint: args.preflight.sourceFingerprint,
    sourceStore: args.source.sourceStore ?? "",
    sourceVersion: args.preflight.sourceVersion,
    transformations: args.preflight.transformations,
    rawSourceDir: args.source.sourceStore,
  });
}

function registerPreparedImport(args: {
  dataDir: string;
  source: ImportSourceSession;
  harness: "pi" | "opencode" | "codex" | "grok-build";
  piSessionJsonl: string;
  importedFilename: string;
  sourceFingerprint: string;
  sourceStore: string;
  sourceVersion?: string;
  transformations: string[];
  sourceContextFiles?: Array<{ filename: string; content: string }>;
  rawSourceDir?: string;
  mode: CapabilityMode;
  workspacePrimaryDir?: string;
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  rolePresetSlug?: string | null;
  soulSlug?: string | null;
  visibility?: "research" | "private";
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
}): { sessionId: string; sourceFingerprint: string } {
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
    if (args.rawSourceDir) {
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
      // Pure can write only inside the managed session workspace. Full-mode
      // roots are rebuilt by the normal reopen path from workspace metadata.
      writableRoots:
        args.mode === "pure"
          ? [dirs.writeDir]
          : [dirs.writeDir, workspacePrimaryDir],
      model: null,
      provider: null,
      promptMode: args.mode === "pure" ? "alt-only" : "pi-default",
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
  const label = harness === "grok-build"
    ? "Grok Build"
    : harness === "opencode"
      ? "OpenCode"
      : harness === "codex"
        ? "Codex"
        : "Pi";
  const suffix = ` · ${label} import ${importedAt.slice(0, 10)} #${String(ordinal).padStart(2, "0")}`;
  const base = sourceName.trim().replace(/\s+/g, " ");
  return `${base.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
}

function requirePiAdapter(harness: ImportHarness): void {
  if (harness !== "pi") {
    throw new ImportHarnessNotImplementedError(harness);
  }
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
