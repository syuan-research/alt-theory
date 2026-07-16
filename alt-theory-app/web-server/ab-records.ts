import { randomUUID } from "crypto";
import { appendFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

export interface AbComparisonCandidate {
  candidateId: string;
  label?: string | null;
  provider?: string | null;
  model?: string | null;
  role?: string | null;
  promptRef?: string | null;
  instructionRef?: string | null;
  kbDomain?: string | null;
  outputText?: string | null;
  artifact?: {
    runId?: string | null;
    sessionId?: string | null;
    asyncDir?: string | null;
    resultFile?: string | null;
    statusFile?: string | null;
    eventsFile?: string | null;
    outputFile?: string | null;
    sessionFile?: string | null;
  } | null;
}

export interface AbComparisonScore {
  candidateId: string;
  metric: string;
  value: number;
}

export interface AbComparisonInput {
  sessionId: string;
  /**
   * Caller-fixed id for append-only updates (recording a choice re-appends
   * the record under the same comparisonId; the latest line wins — see
   * currentAbComparisonRecords). Omit to mint a new comparison.
   */
  comparisonId?: string;
  trigger:
    | "manual"
    | "backend_request"
    | "config_rule"
    | "pi_subagents"
    | "imported";
  /** The prompt text the arms answered (display/provenance). */
  prompt?: string | null;
  promptEntryId?: string | null;
  responseEntryId?: string | null;
  selectedCandidateId?: string | null;
  /** When the participant/researcher made the choice (createdAt stays the generation time). */
  decidedAt?: string | null;
  candidates: AbComparisonCandidate[];
  scores?: AbComparisonScore[];
  notes?: string | null;
  source?: {
    package?: string | null;
    artifactVersion?: string | number | null;
    runId?: string | null;
    asyncDir?: string | null;
    resultFile?: string | null;
    eventsFile?: string | null;
  } | null;
}

export interface AbComparisonRecord extends AbComparisonInput {
  schemaVersion: 1;
  recordType: "ab-comparison";
  comparisonId: string;
  createdAt: string;
}

export function appendAbComparisonRecord(
  recordsDir: string,
  input: AbComparisonInput
): AbComparisonRecord {
  const record = normalizeRecord(input);
  appendFileSync(abComparisonsPath(recordsDir), `${JSON.stringify(record)}\n`, "utf-8");
  return record;
}

export function readAbComparisonRecords(recordsDir: string): AbComparisonRecord[] {
  const path = abComparisonsPath(recordsDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AbComparisonRecord)
    .filter(
      (record) =>
        record.schemaVersion === 1 &&
        record.recordType === "ab-comparison" &&
        Array.isArray(record.candidates)
    );
}

/**
 * The current state of each comparison: the file is append-only, so a choice
 * is recorded by re-appending under the same comparisonId — the last line
 * per id wins. Order follows first appearance (generation order).
 */
export function currentAbComparisonRecords(
  recordsDir: string
): AbComparisonRecord[] {
  const latest = new Map<string, AbComparisonRecord>();
  for (const record of readAbComparisonRecords(recordsDir)) {
    latest.set(record.comparisonId, record);
  }
  return [...latest.values()];
}

function normalizeRecord(input: AbComparisonInput): AbComparisonRecord {
  if (!input.sessionId.trim()) throw new Error("sessionId is required");
  if (!input.candidates.length) throw new Error("at least one candidate is required");
  if (input.candidates.length > 8) throw new Error("too many candidates");
  const candidateIds = new Set<string>();
  for (const candidate of input.candidates) {
    if (!candidate.candidateId.trim()) throw new Error("candidateId is required");
    if (candidateIds.has(candidate.candidateId)) {
      throw new Error(`duplicate candidateId: ${candidate.candidateId}`);
    }
    candidateIds.add(candidate.candidateId);
    if (candidate.outputText && candidate.outputText.length > 20000) {
      throw new Error(`candidate output is too large: ${candidate.candidateId}`);
    }
  }
  if (input.selectedCandidateId && !candidateIds.has(input.selectedCandidateId)) {
    throw new Error("selectedCandidateId must match a candidate");
  }
  for (const score of input.scores ?? []) {
    if (!candidateIds.has(score.candidateId)) {
      throw new Error(`score candidateId must match a candidate: ${score.candidateId}`);
    }
    if (!score.metric.trim()) throw new Error("score metric is required");
    if (!Number.isFinite(score.value)) throw new Error("score value must be finite");
  }
  return {
    schemaVersion: 1,
    recordType: "ab-comparison",
    createdAt: new Date().toISOString(),
    ...input,
    comparisonId: input.comparisonId ?? randomUUID(),
  };
}

function abComparisonsPath(recordsDir: string): string {
  return join(recordsDir, "ab-comparisons.jsonl");
}
