/**
 * Backend gate runner (v1.5 part 2 M8): runs the three gate steps to
 * completion instead of an `&&` chain, so a unit failure no longer hides the
 * tsc and integration results. Same three commands as the old chain, in the
 * same order; one summary line per step; exits 1 when any step failed.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
// tsx's own bin entry — what node_modules/.bin/tsx forwards to — so the
// runner needs no shell and no global install.
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

const steps = [
  {
    name: "tsc-baseline",
    display: "node scripts/check-tsc-baseline.cjs",
    argv: [process.execPath, ["scripts/check-tsc-baseline.cjs"]],
  },
  {
    name: "unit",
    display:
      "tsx --test alt-theory-app/core/**/*.test.ts alt-theory-app/web-server/**/*.test.ts",
    argv: [
      process.execPath,
      [
        tsx,
        "--test",
        "alt-theory-app/core/**/*.test.ts",
        "alt-theory-app/web-server/**/*.test.ts",
      ],
    ],
  },
  {
    name: "integration",
    display: "tsx --test alt-theory-app/web-server/backend-server.integration.ts",
    argv: [
      process.execPath,
      [tsx, "--test", "alt-theory-app/web-server/backend-server.integration.ts"],
    ],
  },
];

let failed = 0;
for (const [index, step] of steps.entries()) {
  console.log(`\n[gate ${index + 1}/${steps.length}] ${step.display}`);
  const result = spawnSync(step.argv[0], step.argv[1], {
    cwd: root,
    stdio: "inherit",
  });
  const code = result.status ?? (result.error || result.signal ? 1 : 0);
  if (code !== 0) failed++;
  console.log(`[gate] ${step.name}: exit ${code}`);
}

if (failed > 0) {
  console.error(`\n[gate] FAILED: ${failed} of ${steps.length} step(s).`);
  process.exit(1);
}
console.log(`\n[gate] OK: all ${steps.length} steps green.`);
