import { existsSync } from "fs";
import { resolve } from "path";

/**
 * Vanilla `public/` ships `config.html`. v6 `public-v6/` is a React SPA — only
 * `index.html` exists; client routing handles `/config`.
 */
export function resolveConfigGuiHtmlPath(publicDir: string): string {
  const configPath = resolve(publicDir, "config.html");
  if (existsSync(configPath)) return configPath;
  return resolve(publicDir, "index.html");
}