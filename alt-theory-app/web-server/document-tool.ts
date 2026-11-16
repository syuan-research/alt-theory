import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { basename, extname, join } from "path";
import { toolPath } from "../core/security-extension.js";
import { extractUploadedBinary } from "./workspace-extract.js";

const parameters = Type.Object({ path: Type.String({ description: "Document file path" }) });

/** The normal read-path policy checks the input; output is app-managed derived text. */
export function createDocumentTool(paths: () => { cwd: string; extractedDir: string }): ToolDefinition<typeof parameters> {
  return {
    name: "convert_document",
    label: "Convert document",
    description: "Fallback document conversion for PDF, DOCX, XLSX and PPTX. Prefer existing document-reading and conversion tools or skills. Use this only when the conversation lacks a usable conversion capability, or the existing conversion cannot run because of missing dependencies or execution failure. Needing conversion alone is not a reason to use this fallback. Returns a text file path; use read with offset/limit or search to inspect it in parts. The original file is unchanged.",
    parameters,
    async execute(_id, params) {
      const { cwd, extractedDir } = paths();
      const source = toolPath(cwd, params.path);
      const result = await extractUploadedBinary(source, false);
      mkdirSync(extractedDir, { recursive: true });
      const output = join(extractedDir, `${basename(source, extname(source))}-${randomUUID().slice(0, 8)}${result.outputExt}`);
      writeFileSync(output, result.content, "utf-8");
      return {
        content: [{ type: "text", text: `Extracted document text: ${output}\nRead this file with offset/limit or search it as needed.` }],
        details: { path: output },
      };
    },
  };
}
