#!/usr/bin/env node
/**
 * i18n sync (alpha.6). English source strings ARE the catalog keys, so the
 * catalogs are self-tracking: this tool (1) extracts every t("...") key from
 * the frontend and backend sources, (2) translates keys missing from
 * zh-Hans via the configured cheap model, (3) derives zh-Hant-HK from
 * zh-Hans (HK written-usage rules), (4) prunes orphaned keys, and (5)
 * rewrites both catalog files sorted. Hand-edited entries survive — only
 * missing keys are ever sent to the model.
 *
 * Model access: reads the deepseek-official provider from
 * ~/.alt-theory/pi-agent/{models,auth}.json (override with I18N_BASE_URL /
 * I18N_API_KEY / I18N_MODEL).
 *
 * Usage: node scripts/i18n-sync.mjs [--check]
 *   --check: report missing/orphaned counts, change nothing, exit 1 if dirty.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join, sep } from "path";
import { fileURLToPath } from "url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FRONTEND_SRC = join(ROOT, "alt-theory-app", "frontend", "src");
const BACKEND_SRC = join(ROOT, "alt-theory-app", "web-server");
const CATALOGS = {
  "zh-Hans": join(FRONTEND_SRC, "i18n", "zh-Hans.ts"),
  "zh-Hant-HK": join(FRONTEND_SRC, "i18n", "zh-Hant-HK.ts"),
};
const GLOSSARY = readFileSync(join(ROOT, "scripts", "i18n-glossary.md"), "utf-8");
const CHECK = process.argv.includes("--check");
const BATCH = 40;

// --- extraction ---------------------------------------------------------

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) yield path;
  }
}

function extractKeys() {
  const keys = new Set();
  // Sweep convention: t("double-quoted english"). The captured raw text is
  // valid JSON string content (may contain \" escapes), so JSON.parse
  // unescapes it exactly.
  // Product tip config stores all locales together through localized(), so
  // those English source keys belong to the catalogs just like t() keys.
  const pattern = /(?:\bt|\blocalized)\(\s*"((?:[^"\\\n]|\\.)+)"/g;
  for (const dir of [FRONTEND_SRC, BACKEND_SRC]) {
    for (const file of walk(dir)) {
      if (file.includes(`${sep}i18n${sep}`)) continue;
      const source = readFileSync(file, "utf-8");
      for (const match of source.matchAll(pattern)) {
        keys.add(JSON.parse(`"${match[1]}"`));
      }
    }
  }
  return keys;
}

// --- catalog io ---------------------------------------------------------

function readCatalog(path) {
  const source = readFileSync(path, "utf-8");
  const body = source.match(/const catalog: Record<string, string> = (\{[\s\S]*?\});/);
  if (!body) throw new Error(`Cannot parse catalog ${path}`);
  // The object literal is JSON-compatible by construction (writeCatalog).
  return body[1].trim() === "{}" ? {} : JSON.parse(body[1]);
}

function writeCatalog(path, entries, header) {
  const sorted = Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
  );
  const body = JSON.stringify(sorted, null, 2);
  writeFileSync(path, `${header}const catalog: Record<string, string> = ${body};\n\nexport default catalog;\n`);
}

const HEADERS = {
  "zh-Hans": `/**
 * Simplified Chinese catalog — GENERATED from English source strings by
 * scripts/i18n-sync.mjs (deepseek). Hand-edits are allowed (the sync tool
 * only rewrites entries whose English source changed), but prefer fixing
 * wording here AND noting it in the glossary so regeneration keeps it.
 */
`,
  "zh-Hant-HK": `/**
 * Traditional Chinese (Hong Kong) catalog — GENERATED from the zh-Hans
 * catalog with HK written-usage rules by scripts/i18n-sync.mjs. Same
 * hand-edit policy as zh-Hans.ts.
 */
`,
};

// --- model --------------------------------------------------------------

function modelConfig() {
  const agentDir = join(homedir(), ".alt-theory", "pi-agent");
  let baseUrl = process.env.I18N_BASE_URL;
  let apiKey = process.env.I18N_API_KEY;
  let model = process.env.I18N_MODEL;
  try {
    const models = JSON.parse(readFileSync(join(agentDir, "models.json"), "utf-8"));
    const auth = JSON.parse(readFileSync(join(agentDir, "auth.json"), "utf-8"));
    baseUrl ||= models.providers?.["deepseek-official"]?.baseUrl;
    apiKey ||= auth["deepseek-official"]?.key;
  } catch {
    // env-only fallback
  }
  model ||= "deepseek-v4-flash";
  if (!baseUrl || !apiKey) {
    throw new Error("No translator model configured (deepseek-official or I18N_* env)");
  }
  return { baseUrl, apiKey, model };
}

async function translateBatch(config, systemPrompt, items) {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(items) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) {
    throw new Error(`Translator HTTP ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  let text = (data.choices?.[0]?.message?.content ?? "{}").trim();
  // Some models fence the JSON despite response_format.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(text);
  const out = parsed.translations ?? parsed;
  if (typeof out !== "object" || out === null) throw new Error("Bad translator output");
  return out;
}

/** One retry on malformed output; a still-bad batch is skipped with a warning
 *  so the run always completes and writes what it has. */
async function translateBatchSafe(config, systemPrompt, items, label) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await translateBatch(config, systemPrompt, items);
    } catch (error) {
      console.warn(`${label}: attempt ${attempt} failed: ${error.message}`);
    }
  }
  console.warn(`${label}: batch skipped (${items.length} items) — rerun i18n-sync to fill.`);
  return {};
}

const SYSTEM_HANS = `You translate UI strings for Alt Theory, an academic app for non-technical social-science users, from English to Simplified Chinese.
Follow this glossary and style guide strictly:\n\n${GLOSSARY}\n
Input: a JSON array of English strings. Output: a JSON object {"translations": {"<english>": "<simplified chinese>"}} covering EVERY input string exactly. Keep {placeholders} unchanged (position may move). Keep brand names and "keep" terms in English.`;

const SYSTEM_HK = `You convert Simplified Chinese UI strings to Traditional Chinese as written in Hong Kong (香港书面语), for Alt Theory.
Follow the zh-Hant-HK rules in this glossary (vocabulary substitutions, not just script conversion):\n\n${GLOSSARY}\n
Input: a JSON array of objects {"en": ..., "zh": ...}. Output: a JSON object {"translations": {"<en>": "<traditional chinese HK>"}} covering EVERY input, converting the zh value (the en is context). Keep {placeholders} and English "keep" terms unchanged.`;

// --- main ---------------------------------------------------------------

const keys = extractKeys();
console.log(`source keys: ${keys.size}`);
const hans = readCatalog(CATALOGS["zh-Hans"]);
const hk = readCatalog(CATALOGS["zh-Hant-HK"]);

const missingHans = [...keys].filter((key) => !(key in hans));
const missingHk = [...keys].filter((key) => !(key in hk));
const orphans = Object.keys(hans).filter((key) => !keys.has(key));

if (CHECK) {
  console.log(`missing zh-Hans: ${missingHans.length}, missing zh-Hant-HK: ${missingHk.length}, orphaned: ${orphans.length}`);
  if (missingHans.length) console.log(`missing: ${missingHans.join(" | ")}`);
  if (orphans.length) console.log(`orphaned: ${orphans.join(" | ")}`);
  process.exit(missingHans.length || missingHk.length || orphans.length ? 1 : 0);
}

const config = missingHans.length || missingHk.length ? modelConfig() : null;
for (let index = 0; index < missingHans.length; index += BATCH) {
  const slice = missingHans.slice(index, index + BATCH);
  const result = await translateBatchSafe(config, SYSTEM_HANS, slice, "zh-Hans");
  for (const key of slice) {
    if (typeof result[key] === "string" && result[key].trim()) hans[key] = result[key];
    else console.warn(`zh-Hans: translator skipped: ${key}`);
  }
  console.log(`zh-Hans ${Math.min(index + BATCH, missingHans.length)}/${missingHans.length}`);
}
for (const key of orphans) delete hans[key];

for (let index = 0; index < missingHk.length; index += BATCH) {
  const slice = missingHk.slice(index, index + BATCH);
  const items = slice.map((key) => ({ en: key, zh: hans[key] }));
  const result = await translateBatchSafe(config, SYSTEM_HK, items, "zh-Hant-HK");
  for (const key of slice) {
    if (typeof result[key] === "string" && result[key].trim()) hk[key] = result[key];
    else console.warn(`zh-Hant-HK: translator skipped: ${key}`);
  }
  console.log(`zh-Hant-HK ${Math.min(index + BATCH, missingHk.length)}/${missingHk.length}`);
}
for (const key of Object.keys(hk)) if (!keys.has(key)) delete hk[key];

writeCatalog(CATALOGS["zh-Hans"], hans, HEADERS["zh-Hans"]);
writeCatalog(CATALOGS["zh-Hant-HK"], hk, HEADERS["zh-Hant-HK"]);
console.log(`done. zh-Hans: ${Object.keys(hans).length} entries, zh-Hant-HK: ${Object.keys(hk).length} entries.`);
