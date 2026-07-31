#!/usr/bin/env node
/**
 * Build user-facing zh-Hans parallel docs + Chinese PDF.
 *
 * DEPRECATED workflow note (2026-07-30):
 * User docs are hand-maintained under docs/en/ and docs/zh-Hans/.
 * Helper no longer embeds references/docs/. This script may still build a
 * PDF from docs/zh-Hans/ or mirror from docs/en/; do not treat it as the
 * primary authoring path.
 *
 * Usage:
 *   node scripts/docs-zh-build.mjs              # mirror + translate missing via model if configured
 *   node scripts/docs-zh-build.mjs --pdf-only   # PDF from existing zh-Hans
 *   node scripts/docs-zh-build.mjs --structure  # copy EN structure with Chinese wrappers only
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const enRoot = join(repoRoot, "docs/en");
const zhRoot = join(repoRoot, "docs/zh-Hans");
const pdfDir = join(repoRoot, "docs/pdf");
const pdfPath = join(pdfDir, "alt-theory-user-guide-zh-Hans.pdf");

const args = new Set(process.argv.slice(2));

function walkMd(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMd(full, base));
    else if (entry.name.endsWith(".md")) out.push(relative(base, full));
  }
  return out.sort();
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function bundledDocAnchor(relPath) {
  return `doc-${relPath
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function prepareBundledDoc(relPath, knownDocs) {
  const source = readFileSync(join(zhRoot, relPath), "utf8").trimEnd();
  const rewritten = source.replace(
    /\]\(([^)\s]+\.md)(?:#[^)]*)?\)/gi,
    (match, target) => {
      const targetRel = relative(
        zhRoot,
        resolve(zhRoot, dirname(relPath), target),
      ).replace(/\\/g, "/");
      return knownDocs.has(targetRel)
        ? `](#${bundledDocAnchor(targetRel)})`
        : match;
    },
  );
  return `<a id="${bundledDocAnchor(relPath)}"></a>\n\n${rewritten}`;
}

/** Lightweight glossary wrap when no live translator is available. */
function structureChinese(enText, relPath) {
  return `---
lang: zh-Hans
source: docs/en/${relPath.replace(/\\/g, "/")}
note: 用户向中文文档（Helper 仍只读英文 corpus）。若正文仍为英文，表示待人工或同步工具润色。
---

# （中文）${relPath.replace(/\\/g, "/")}

> 本页与英文 Helper 文档对应。产品内 Helper 继续读取英文；此树供熟人阅读与 PDF。

${enText}
`;
}

function loadDeepseekConfig() {
  try {
    const authPath = join(homedir(), ".alt-theory", "pi-agent", "auth.json");
    const modelsPath = join(homedir(), ".alt-theory", "pi-agent", "models.json");
    if (!existsSync(authPath) || !existsSync(modelsPath)) return null;
    const auth = JSON.parse(readFileSync(authPath, "utf8"));
    const models = JSON.parse(readFileSync(modelsPath, "utf8"));
    // Prefer deepseek-style openai-completions entry with a key.
    const providers = models.providers || models;
    let baseUrl = "https://api.deepseek.com/v1";
    let modelId = "deepseek-chat";
    let apiKey = null;
    if (Array.isArray(providers)) {
      // older shapes
    } else if (providers && typeof providers === "object") {
      for (const [name, p] of Object.entries(providers)) {
        const key =
          auth[name]?.key ||
          auth[name]?.apiKey ||
          auth.apiKeys?.[name] ||
          auth.keys?.[name];
        if (key && /deepseek/i.test(name + JSON.stringify(p))) {
          apiKey = key;
          baseUrl = (p.baseUrl || baseUrl).replace(/\/$/, "");
          const m = (p.models || [])[0];
          modelId = typeof m === "string" ? m : m?.id || modelId;
          break;
        }
      }
    }
    // auth.json common shapes
    if (!apiKey) {
      apiKey =
        auth.deepseek?.key ||
        auth.deepseek?.apiKey ||
        auth.apiKeys?.deepseek ||
        null;
    }
    if (!apiKey) return null;
    return { baseUrl, modelId, apiKey };
  } catch {
    return null;
  }
}

async function translateWithModel(enText, relPath, cfg) {
  const system = `你是技术文档译者。将 Alt Theory 用户文档译为简体中文（zh-Hans）。
保留 Markdown 结构、链接路径、代码块与命令原样。产品专有名词可保留英文并在首次出现时加中文：
Understand=理解模式, Work=工作模式, Helper=Helper, Branch=分支, BTW=BTW, Settings=设置。
只输出译文 Markdown，不要前言。`;
  const url = `${cfg.baseUrl}/chat/completions`;
  const body = {
    model: cfg.modelId,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `文件: ${relPath}\n\n${enText.slice(0, 12000)}`,
      },
    ],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`translate HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty translation");
  return text;
}

async function buildZh() {
  mkdirSync(zhRoot, { recursive: true });
  const files = walkMd(enRoot);
  const cfg = args.has("--structure") ? null : loadDeepseekConfig();
  let translated = 0;
  let structured = 0;
  for (const rel of files) {
    const enPath = join(enRoot, rel);
    const zhPath = join(zhRoot, rel);
    const enText = readFileSync(enPath, "utf8");
    ensureDir(zhPath);
    if (existsSync(zhPath) && !args.has("--force")) {
      // Keep existing human or prior machine translations.
      continue;
    }
    if (cfg) {
      try {
        const zh = await translateWithModel(enText, rel, cfg);
        writeFileSync(zhPath, zh.endsWith("\n") ? zh : zh + "\n", "utf8");
        translated += 1;
        console.log("translated", rel);
        continue;
      } catch (err) {
        console.warn("translate failed, structure fallback:", rel, err.message);
      }
    }
    writeFileSync(zhPath, structureChinese(enText, rel), "utf8");
    structured += 1;
    console.log("structure", rel);
  }
  // Index for acquaintances
  writeFileSync(
    join(zhRoot, "00-README.md"),
    `# Alt Theory 用户文档（简体中文）

本目录与英文 Helper 文档平行，供熟人阅读与 PDF。**应用内 Helper 只读英文 docs。**

生成：\`node scripts/docs-zh-build.mjs\`
PDF：\`npm run docs:zh-pdf\`（需要 Pandoc）

页数：${files.length}（与英文 corpus 对齐）。
`,
    "utf8",
  );
  console.log(
    JSON.stringify({ files: files.length, translated, structured, zhRoot }, null, 2),
  );
}

function buildPdf() {
  mkdirSync(pdfDir, { recursive: true });
  const files = walkMd(zhRoot)
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => f !== "00-README.md");
  if (files.length === 0) {
    console.error("No zh-Hans markdown under docs/zh-Hans — run build first");
    process.exit(1);
  }
  const ordered = [
    "00-README.md",
    "README.md",
    ...files.filter((f) => f.startsWith("start-here/")),
    ...files.filter((f) => f.startsWith("using-the-app/")),
    ...files.filter((f) => f.startsWith("system-guide/")),
    ...files.filter((f) => f.startsWith("help/")),
    ...files.filter((f) => f.startsWith("advanced/")),
    ...files.filter(
      (f) =>
        !f.startsWith("start-here/") &&
        !f.startsWith("using-the-app/") &&
        !f.startsWith("system-guide/") &&
        !f.startsWith("help/") &&
        !f.startsWith("advanced/") &&
        f !== "README.md",
    ),
  ].filter((f, i, arr) => existsSync(join(zhRoot, f)) && arr.indexOf(f) === i);

  const pandoc = process.platform === "win32" ? "pandoc.exe" : "pandoc";
  const which = spawnSync(process.platform === "win32" ? "where.exe" : "which", [
    pandoc.replace(/\.exe$/, ""),
  ]);
  // On Windows pandoc is on PATH as pandoc.exe
  // Always write the concatenated markdown guide (portable, no LaTeX).
  const bundle = join(pdfDir, "alt-theory-user-guide-zh-Hans.md");
  const knownDocs = new Set(ordered);
  writeFileSync(
    bundle,
    `${ordered
      .map((relPath) => prepareBundledDoc(relPath, knownDocs))
      .join("\n\n---\n\n")}\n`,
    "utf8",
  );
  console.log("wrote", bundle, "bytes", statSync(bundle).size);

  // Optional PDF when a lightweight engine is available (html→pdf avoids hung latex).
  try {
    const htmlPath = join(pdfDir, "alt-theory-user-guide-zh-Hans.html");
    execFileSync(
      "pandoc",
      [
        bundle,
        "-o",
        htmlPath,
        "--from",
        "markdown",
        "--standalone",
        "--toc",
        "--metadata",
        "title=Alt Theory 用户指南（简体中文）",
      ],
      { stdio: "inherit", timeout: 60_000 },
    );
    // Prefer weasy/wkhtml only if present; otherwise keep HTML+MD as the ship artifact.
    const pdfTry = spawnSync(
      "pandoc",
      [bundle, "-o", pdfPath, "--from", "markdown", "-t", "html", "--pdf-engine=wkhtmltopdf"],
      { encoding: "utf8", timeout: 60_000 },
    );
    if (pdfTry.status === 0 && existsSync(pdfPath) && statSync(pdfPath).size > 1000) {
      console.log("wrote", pdfPath, "bytes", statSync(pdfPath).size);
    } else {
      const browser = process.platform === "win32"
        ? [
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          ].find(existsSync)
        : null;
      const browserPdf = browser
        ? spawnSync(
            browser,
            [
              "--headless",
              "--disable-gpu",
              "--no-pdf-header-footer",
              `--print-to-pdf=${pdfPath}`,
              pathToFileURL(htmlPath).href,
            ],
            { encoding: "utf8", timeout: 60_000 },
          )
        : null;
      if (browserPdf?.status === 0 && existsSync(pdfPath) && statSync(pdfPath).size > 1000) {
        console.log("wrote", pdfPath, "bytes", statSync(pdfPath).size);
        return;
      }
      writeFileSync(
        join(pdfDir, "PDF-README.md"),
        `# Chinese user guide artifacts

- \`alt-theory-user-guide-zh-Hans.md\` — full concatenated guide (primary).
- \`alt-theory-user-guide-zh-Hans.html\` — standalone HTML (print to PDF from a browser if needed).
- No supported browser or PDF engine was available; use the HTML print path.

Regenerate: \`node scripts/docs-zh-build.mjs --pdf-only\`
`,
        "utf8",
      );
      console.log("PDF engine unavailable; HTML + MD artifacts written under docs/pdf/");
    }
  } catch (err) {
    console.error("pandoc html step failed:", err.message);
    console.log("markdown bundle remains at", bundle);
  }
}

const mode = args.has("--pdf-only")
  ? "pdf"
  : args.has("--structure")
    ? "structure"
    : "all";

if (mode === "pdf") {
  buildPdf();
} else {
  await buildZh();
  if (!args.has("--no-pdf")) {
    try {
      buildPdf();
    } catch (e) {
      console.warn("pdf step:", e.message);
    }
  }
}
