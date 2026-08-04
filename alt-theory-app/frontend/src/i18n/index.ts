/**
 * App UI language (alpha.6). Hand-rolled on purpose (no i18n lib): t() is a
 * plain module function keyed on the English source string; the active
 * catalog is loaded ONCE before first render (initI18n in main.tsx), and
 * changing the language setting reloads the page — so no context/re-render
 * plumbing exists anywhere else.
 */
import { getLangSetting } from "../api/config";

export type Lang = "en" | "zh-Hans" | "zh-Hant-HK";
export type LangSetting = Lang | "auto";

export const LANG_SETTING_VALUES: LangSetting[] = [
  "auto",
  "en",
  "zh-Hans",
  "zh-Hant-HK",
];

let current: Lang = "en";
let catalog: Record<string, string> = {};

export function resolveLang(
  setting: LangSetting | null | undefined,
  navigatorLanguage: string,
): Lang {
  if (setting && setting !== "auto") return setting;
  const nav = navigatorLanguage.toLowerCase();
  if (!nav.startsWith("zh")) return "en";
  return nav.includes("hant") || nav.startsWith("zh-hk") || nav.startsWith("zh-tw")
    ? "zh-Hant-HK"
    : "zh-Hans";
}

/** Load the language setting and its catalog; await before first render. */
export async function initI18n(): Promise<void> {
  let setting: LangSetting | null = null;
  try {
    setting = (await getLangSetting()).lang;
  } catch {
    // Non-local mode or server hiccup: fall through to auto.
  }
  current = resolveLang(setting, navigator.language);
  if (current === "zh-Hans") {
    catalog = (await import("./zh-Hans")).default;
  } else if (current === "zh-Hant-HK") {
    catalog = (await import("./zh-Hant-HK")).default;
  }
}

export function currentLang(): Lang {
  return current;
}

/** Translate an English source string; missing entries return the English. */
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
