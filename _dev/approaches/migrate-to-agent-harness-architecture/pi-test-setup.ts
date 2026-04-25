/**
 * PI SDK Basic Test Script
 * Verifies: API key config, model listing, basic session creation
 *
 * Usage: npx tsx _dev/approaches/migrate-to-agent-harness-architecture/pi-test-setup.ts
 */

import { createAgentSession, AuthStorage, getAgentDir } from "@mariozechner/pi-coding-agent";
import { ModelRegistry } from "@mariozechner/pi-coding-agent";
import "dotenv/config";

async function main() {
  console.log("=== PI SDK Basic Test ===\n");

  // Step 1: Configure API key
  console.log("Step 1: Configuring MiniMax API key...");
  const authStorage = AuthStorage.create();
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey || apiKey === "sk-your-key-here") {
    console.error("ERROR: MINIMAX_API_KEY not set in .env");
    process.exit(1);
  }
  authStorage.setRuntimeApiKey("minimax", apiKey);
  console.log("  ✓ API key configured\n");

  // Step 2: List available models
  console.log("Step 2: Listing available models...");
  const agentDir = getAgentDir();
  const modelRegistry = ModelRegistry.create(authStorage, `${agentDir}/models.json`);
  const available = await modelRegistry.getAvailable();
  console.log("  Available models:");
  for (const m of available) {
    console.log(`    - ${m.provider}/${m.id}`);
  }

  const hasMiniMax = available.some(m => m.provider === "minimax" && m.id === "MiniMax-M2.7");
  console.log(`\n  ${hasMiniMax ? "✓" : "✗"} MiniMax-M2.7 ${hasMiniMax ? "found" : "NOT found"}\n`);

  // Step 3: Create basic session and test
  console.log("Step 3: Creating basic session...");
  try {
    const { session } = await createAgentSession({
      authStorage,
      modelRegistry,
      noTools: "all",
    });
    console.log("  ✓ Session created successfully");
    console.log(`  Session ID: ${session.sessionId}`);

    // Try a simple prompt
    console.log("\n  Sending test prompt...");
    const response = await session.prompt("What files are in the current directory?");
    console.log("  ✓ Got response:");
    for await (const event of response) {
      if (event.type === "text") {
        process.stdout.write(event.text);
      }
    }
    console.log("\n");
  } catch (err) {
    console.error("  ✗ Session creation failed:", err);
    process.exit(1);
  }

  console.log("=== All tests passed ===");
}

main().catch(console.error);
