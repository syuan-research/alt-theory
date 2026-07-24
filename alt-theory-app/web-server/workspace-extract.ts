import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { extname } from "path";

export interface ExtractResult {
  content: string;
  outputExt: ".md" | ".txt" | ".csv";
}

function useCliBackend(): boolean {
  return process.env.WORKSPACE_EXTRACT_USE_CLI === "1";
}

function assertNonEmptyText(content: string, label: string): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    throw new Error(`${label}: no extractable text`);
  }
  return content;
}

async function extractDocxNode(filePath: string): Promise<ExtractResult> {
  // mammoth has no markdown converter (only convertToHtml / extractRawText),
  // so the Node path yields readable plain text. The pandoc CLI path
  // (extractDocxCli, WORKSPACE_EXTRACT_USE_CLI=1) yields richer markdown.
  const mammoth = await import("mammoth");
  const buffer = readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return {
    content: assertNonEmptyText(result.value, "DOCX"),
    outputExt: ".txt",
  };
}

function extractDocxCli(filePath: string): ExtractResult {
  const result = spawnSync("pandoc", [filePath, "-t", "markdown"], {
    encoding: "utf-8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr?.trim() || "pandoc failed");
  }
  return {
    content: assertNonEmptyText(result.stdout, "DOCX"),
    outputExt: ".md",
  };
}

async function extractPdfNode(filePath: string): Promise<ExtractResult> {
  const pdfParse = (await import("pdf-parse")).default;
  const buffer = readFileSync(filePath);
  const parsed = await pdfParse(buffer);
  return {
    content: assertNonEmptyText(parsed.text || "", "PDF"),
    outputExt: ".txt",
  };
}

function extractPdfCli(filePath: string): ExtractResult {
  const result = spawnSync("pdftotext", [filePath, "-"], {
    encoding: "utf-8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr?.trim() || "pdftotext failed");
  }
  return {
    content: assertNonEmptyText(result.stdout, "PDF"),
    outputExt: ".txt",
  };
}

async function extractXlsxNode(filePath: string): Promise<ExtractResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(readFileSync(filePath), { type: "buffer" });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error("XLSX: no sheets");
  }
  if (sheetNames.length === 1) {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetNames[0]]);
    return {
      content: assertNonEmptyText(csv, "XLSX"),
      outputExt: ".csv",
    };
  }
  const parts = sheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
    return `## ${name}\n\n${csv}`;
  });
  return {
    content: assertNonEmptyText(parts.join("\n\n"), "XLSX"),
    outputExt: ".md",
  };
}

async function extractPptxNode(filePath: string): Promise<ExtractResult> {
  // A .pptx is a zip; visible text lives in <a:t> runs of ppt/slides/*.xml.
  // ponytail: regex text-run extraction, no layout/tables/notes — swap in a
  // real pptx parser if beta users need structure.
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(readFileSync(filePath));
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(
      (a, b) =>
        Number(a.match(/slide(\d+)/)?.[1] ?? 0) -
        Number(b.match(/slide(\d+)/)?.[1] ?? 0)
    );
  if (slideNames.length === 0) {
    throw new Error("PPTX: no slides");
  }
  const parts: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async("string");
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
      .map((m) => m[1])
      .filter((text) => text.trim());
    const slideNo = name.match(/slide(\d+)/)?.[1];
    parts.push(`## Slide ${slideNo}\n\n${runs.join("\n")}`);
  }
  return {
    content: assertNonEmptyText(parts.join("\n\n"), "PPTX"),
    outputExt: ".md",
  };
}

export async function extractUploadedBinary(
  filePath: string
): Promise<ExtractResult> {
  const ext = extname(filePath).toLowerCase();
  if (useCliBackend()) {
    if (ext === ".docx") return extractDocxCli(filePath);
    if (ext === ".pdf") return extractPdfCli(filePath);
  }
  if (ext === ".docx") return extractDocxNode(filePath);
  if (ext === ".pdf") return extractPdfNode(filePath);
  if (ext === ".xlsx") return extractXlsxNode(filePath);
  if (ext === ".pptx") return extractPptxNode(filePath);
  throw new Error(`Unsupported binary type: ${ext}`);
}

export function convertedFileName(originalBaseName: string): string {
  const ext = extname(originalBaseName);
  const stem = originalBaseName.slice(0, -ext.length);
  return `${stem}_converted_from_binary`;
}