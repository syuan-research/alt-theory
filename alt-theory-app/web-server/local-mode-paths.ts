import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * Align local dev web with the Windows bundle / v0.5.4 isolation layout:
 *   ~/.alt-theory/data      → session data (ALT_THEORY_DATA_DIR)
 *   ~/.alt-theory/pi-agent  → Pi models/auth/settings (PI_CODING_AGENT_DIR)
 *
 * Electron main.cjs sets the same defaults before starting the backend.
 * Dev scripts only set ALT_THEORY_MODE=local, so without this helper the
 * web server would fall back to Pi's shared ~/.pi/agent and Windows
 * %APPDATA%/alt-theory data dir — a different store than the bundle.
 *
 * Explicit env overrides are always respected.
 */
export function ensureLocalModeDefaults(): void {
  if (process.env.ALT_THEORY_MODE !== "local") return;

  const root = join(homedir(), ".alt-theory");

  if (!process.env.PI_CODING_AGENT_DIR) {
    const piAgentDir = join(root, "pi-agent");
    process.env.PI_CODING_AGENT_DIR = piAgentDir;
    mkdirSync(piAgentDir, { recursive: true });
  }

  if (!process.env.ALT_THEORY_DATA_DIR) {
    const dataDir = join(root, "data");
    process.env.ALT_THEORY_DATA_DIR = dataDir;
    mkdirSync(dataDir, { recursive: true });
  }
}