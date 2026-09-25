/**
 * Refreshes the models.dev snapshot shipped with the app
 * (agent-assets/model-presets/models-dev-snapshot.json.gz): the catalog the
 * app uses before its first successful models.dev fetch or without network.
 * Run before a release when provider metadata moved:
 *
 *   npx tsx scripts/refresh-models-dev-snapshot.ts
 */
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { compactCatalog } from "../alt-theory-app/web-server/models-dev-metadata.js";

const response = await fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`models.dev returned ${response.status}`);
const catalog = compactCatalog(await response.json());
if (!catalog) throw new Error("models.dev returned invalid metadata");
const out = "agent-assets/model-presets/models-dev-snapshot.json.gz";
writeFileSync(out, gzipSync(JSON.stringify(catalog), { level: 9 }));
console.log(`${out}: ${Object.keys(catalog).length} providers`);
