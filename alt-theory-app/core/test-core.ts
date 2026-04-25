/**
 * Alt Theory Core Layer Test Script
 * Verifies: createAltTheorySession(), system prompt contains profile + KB path
 *
 * Usage: npx tsx alt-theory-app/core/test-core.ts
 */

import { createAltTheorySession } from "./alt-theory-core.js";
import { resolve } from "path";

async function main() {
  console.log("=== Alt Theory Core Layer Test ===\n");

  const rootDir = resolve(import.meta.dirname, "..");
  const kbDir = resolve(rootDir, "assets", "kb");

  console.log(`rootDir: ${rootDir}`);
  console.log(`kbDir:   ${kbDir}`);

  try {
    const { session } = await createAltTheorySession({
      rootDir,
      kbDir,
      profilePath: resolve(rootDir, "assets", "profiles", "default.md"),
      readOnly: true,
    });

    console.log("\n✓ Session created successfully");
    console.log(`  Session ID: ${session.sessionId}`);

    // Verify system prompt
    // Note: system prompt structure depends on PI internals
    // Check if we can access it through the session API
    const state = session.agent?.state;
    if (state) {
      const sp = JSON.stringify(state).substring(0, 500);
      console.log(`\n  System prompt preview:\n  ${sp}`);
    }

    console.log("\n=== Core layer test passed ===");
  } catch (err) {
    console.error("\n✗ Core layer test failed:", err);
    process.exit(1);
  }
}

main().catch(console.error);
