/**
 * Backend user-visible text language (alpha.6). Shares the SAME generated
 * catalogs as the frontend (scripts/i18n-sync.mjs scans both trees), and the
 * same rule: t() is keyed on the English source string and falls back to it.
 *
 * Model-facing text (tool results, agent-mail bodies, prompts) must NEVER go
 * through t() — only text whose sole audience is the user. The app is
 * single-user local, so the language is module state: set at server boot
 * from app settings and again when the setting changes.
 */
import zhHans from "../frontend/src/i18n/zh-Hans.js";
import zhHantHK from "../frontend/src/i18n/zh-Hant-HK.js";

export type BackendLang = "en" | "zh-Hans" | "zh-Hant-HK";

let catalog: Record<string, string> = {};

/** "auto" and absent mean English on the backend (no navigator to follow). */
export function setBackendLang(
  setting: "auto" | "en" | "zh-Hans" | "zh-Hant-HK" | null | undefined,
): void {
  if (setting === "zh-Hans") catalog = zhHans;
  else if (setting === "zh-Hant-HK") catalog = zhHantHK;
  else catalog = {};
}

export function t(
  text: string,
  params?: Record<string, string | number>,
): string {
  let out = catalog[text] ?? text;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      out = out.split(`{${key}}`).join(String(value));
    }
  }
  return out;
}
