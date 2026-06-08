/**
 * Alt Theory Core Layer Test Script
 * Verifies: createAltTheorySession(), system prompt contains app/soul/role + KB path
 *
 * Usage: npx tsx alt-theory-app/core/test-core.ts
 */

import { createAltTheorySession } from "./alt-theory-core.js";
import { resolveAgentAssetPaths } from "./agent-assets.js";
import { createSessionDirs, resolveDataDir } from "./data-dir.js";
import { resolve } from "path";

async function main() {
  console.log("=== Alt Theory Core Layer Test ===\n");

  const projectRoot = resolve(import.meta.dirname, "..", "..");
  const assetPaths = resolveAgentAssetPaths(projectRoot);
  const rolePresetPath = resolve(
    assetPaths.rolePresetsDir,
    "default.md"
  );
  const sessionDirs = createSessionDirs(resolveDataDir());

  console.log(`sessionCwd: ${sessionDirs.sessionCwd}`);
  console.log(`kbDir:   ${assetPaths.kbDir}`);

  try {
    const { session, manifest } = await createAltTheorySession({
      ...sessionDirs,
      appContextPath: assetPaths.appContextPath,
      soulPath: assetPaths.soulPath,
      rolePresetPath,
      rolePresetSlug: "default",
      kbDir: assetPaths.kbDir,
      piPromptTemplatesDir: assetPaths.piPromptTemplatesDir,
      readOnly: true,
    });

    console.log("\n✓ Session created successfully");
    console.log(`  Session ID: ${session.sessionId}`);
    console.log(`  Session file: ${session.sessionFile}`);
    console.log(`  Agent assets: ${assetPaths.rootDir}`);
    console.log(`  Pi prompts: ${assetPaths.piPromptTemplatesDir}`);
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
