import { createHash } from "crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "fs";
import { isAbsolute, relative, resolve } from "path";

export const MAX_INSTRUCTION_BYTES = 256 * 1024;

export interface InstructionAssetSummary {
  ref: string;
  displayName: string;
  size: number;
}

export interface LoadedInstructionAsset extends InstructionAssetSummary {
  path: string;
  sha256: string;
  content: string;
}

export function listInstructionAssets(
  rootDir: string
): InstructionAssetSummary[] {
  const root = resolve(rootDir);
  if (!existsSync(root)) return [];

  const assets: InstructionAssetSummary[] = [];
  walk(root, root, assets);
  return assets.sort((a, b) => a.ref.localeCompare(b.ref));
}

export function loadInstructionAsset(
  rootDir: string,
  ref: string
): LoadedInstructionAsset {
  const root = resolve(rootDir);
  if (!ref || isAbsolute(ref)) {
    throw new Error("Instruction reference is required and must be relative");
  }
  if (!existsSync(root)) {
    throw new Error(`Instruction root not found: ${root}`);
  }

  const path = resolve(root, ref);
  assertInside(root, path);
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Instruction asset not found: ${ref}`);
  }
  assertInside(realpathSync(root), realpathSync(path));

  const content = readFileSync(path);
  if (content.byteLength > MAX_INSTRUCTION_BYTES) {
    throw new Error(`Instruction asset is too large: ${ref}`);
  }
  const text = decodeText(content, ref);
  return {
    ref: normalizeRef(relative(root, path)),
    displayName: normalizeRef(relative(root, path)),
    path,
    size: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    content: text,
  };
}

function walk(
  root: string,
  directory: string,
  assets: InstructionAssetSummary[]
): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      try {
        assertInside(realpathSync(root), realpathSync(path));
      } catch {
        continue;
      }
    }
    if (entry.isDirectory()) {
      walk(root, path, assets);
      continue;
    }
    if (!entry.isFile() && !lstatSync(path).isFile()) continue;
    const ref = normalizeRef(relative(root, path));
    try {
      const loaded = loadInstructionAsset(root, ref);
      assets.push({
        ref: loaded.ref,
        displayName: loaded.displayName,
        size: loaded.size,
      });
    } catch {
      // Catalog only assets that are safe to load.
    }
  }
}

function decodeText(content: Buffer, ref: string): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new Error(`Instruction asset is not valid UTF-8 text: ${ref}`);
  }
  if (text.includes("\0")) {
    throw new Error(`Instruction asset appears to be binary: ${ref}`);
  }
  const suspicious = [...text].filter((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && char !== "\n" && char !== "\r" && char !== "\t";
  }).length;
  if (text.length > 0 && suspicious / text.length > 0.01) {
    throw new Error(`Instruction asset appears to be binary: ${ref}`);
  }
  return text;
}

function assertInside(root: string, target: string): void {
  const rel = relative(normalizePath(resolve(root)), normalizePath(resolve(target)));
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Instruction asset must stay inside the configured root");
  }
}

function normalizePath(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function normalizeRef(ref: string): string {
  return ref.replace(/\\/g, "/");
}
