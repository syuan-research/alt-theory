import { randomUUID } from "crypto";
import { existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";
import type {
  AssemblyManifest,
  PromptMode,
  ResourceDiscoveryMode,
} from "../core/alt-theory-core.js";

export interface EffectiveSessionConfig {
  projectId: string | null;
  rolePresetSlug: string | null;
  soulSlug: string | null;
  kbDomain: string;
  provider: string | null;
  model: string | null;
  customInstruction: {
    ref: string | null;
    path: string | null;
    sha256: string | null;
  };
  skills: Array<{
    name: string;
    path: string;
    sha256: string | null;
    source: "alt-theory" | "debug";
  }>;
  promptMode: PromptMode;
  resourceDiscovery: ResourceDiscoveryMode;
}

export interface ConfigEvent {
  schemaVersion: 1;
  recordType: "config-event";
  eventId: string;
  sessionId: string;
  branchId: string;
  at: string;
  reason: "creation" | "user_change" | "resume_fallback";
  effective: EffectiveSessionConfig;
  changedFields: string[];
  warnings: string[];
}

export function buildEffectiveConfig(
  manifest: AssemblyManifest,
  projectId: string | null = null
): EffectiveSessionConfig {
  return {
    projectId,
    rolePresetSlug: manifest.rolePreset?.slug ?? null,
    soulSlug: manifest.soul?.slug ?? null,
    kbDomain: manifest.kb?.domain ?? manifest.kbDomain ?? "all",
    provider: manifest.provider ?? null,
    model: manifest.model ?? null,
    customInstruction: {
      ref: manifest.customInstruction?.ref ?? null,
      path: manifest.customInstruction?.path ?? null,
      sha256: manifest.customInstruction?.sha256 ?? null,
    },
    skills: manifest.skills ?? [],
    promptMode: manifest.promptMode,
    resourceDiscovery: manifest.resourceDiscovery.mode,
  };
}

export function appendConfigEvent(
  recordsDir: string,
  args: {
    sessionId: string;
    reason: ConfigEvent["reason"];
    effective: EffectiveSessionConfig;
    changedFields?: string[];
    warnings?: string[];
    branchId?: string;
  }
): ConfigEvent {
  const event: ConfigEvent = {
    schemaVersion: 1,
    recordType: "config-event",
    eventId: randomUUID(),
    sessionId: args.sessionId,
    branchId: args.branchId ?? "main",
    at: new Date().toISOString(),
    reason: args.reason,
    effective: args.effective,
    changedFields: args.changedFields ?? [],
    warnings: args.warnings ?? [],
  };
  appendFileSync(configEventsPath(recordsDir), `${JSON.stringify(event)}\n`, "utf-8");
  return event;
}

export function readConfigEvents(recordsDir: string): ConfigEvent[] {
  const path = configEventsPath(recordsDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ConfigEvent)
    .filter(
      (event) =>
        event.schemaVersion === 1 && event.recordType === "config-event"
    );
}

function configEventsPath(recordsDir: string): string {
  return join(recordsDir, "config-events.jsonl");
}
