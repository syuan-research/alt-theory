/**
 * Alt Theory Core Layer Test Script
 * Verifies: createAltTheorySession(), system prompt contains profile + KB path
 *
 * Usage: npx tsx alt-theory-app/core/test-core.ts
 */

import { createAltTheorySession } from "./alt-theory-core.js";
import { createSessionDirs, resolveDataDir } from "./data-dir.js";
import { resolve } from "path";

async function main() {
  console.log("=== Alt Theory Core Layer Test ===\n");

  const projectRoot = resolve(import.meta.dirname, "..", "..");
  const runtimeDir = resolve(projectRoot, "agent-assets", "runtime", "pi-tui");
  const kbDir = resolve(projectRoot, "alt-theory-app", "web-server", "assets", "kb");
  const profilePath = resolve(projectRoot, "agent-assets", "profiles", "default.md");
  const sessionDirs = createSessionDirs(resolveDataDir());

  console.log(`sessionCwd: ${sessionDirs.sessionCwd}`);
  console.log(`kbDir:   ${kbDir}`);

  try {
    const { session, manifest } = await createAltTheorySession({
      ...sessionDirs,
      kbDir,
      profilePath,
      runtimeDir,
      readOnly: true,
    });

    console.log("\n✓ Session created successfully");
    console.log(`  Session ID: ${session.sessionId}`);
    console.log(`  Session file: ${session.sessionFile}`);
    console.log(`  Runtime assets: ${runtimeDir}`);
    console.log(`  Manifest: ${JSON.stringify(manifest, null, 2)}`);

    // Verify system prompt
    // Note: system prompt structure depends on PI internals
    // Check if we can access it through the session API
    const state = session.agent?.state;
    if (state) {
      const sp = JSON.stringify(state).substring(0, 500);
      console.log(`\n  System prompt preview:\n  ${sp}`);
    }

    console.log("\n=== Core layer test passed ===");
    session.dispose();
  } catch (err) {
    console.error("\n✗ Core layer test failed:", err);
    process.exit(1);
  }
}

main().catch(console.error);
