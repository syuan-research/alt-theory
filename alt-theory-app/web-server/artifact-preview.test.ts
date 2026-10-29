import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionDirs } from "../core/data-dir.js";
import { createArtifactPreview } from "./artifact-preview.js";

test("a report's sibling scripts, data and binary images share its directory URL", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-artifact-"));
  const dirs = createSessionDirs(dataDir, "report-test");
  const report = join(dirs.sessionCwd, "analysis report");
  mkdirSync(join(report, "data"), { recursive: true });
  writeFileSync(join(report, "index.html"), '<script src="app.js"></script><img src="plot.png">');
  writeFileSync(join(report, "app.js"), 'fetch("data/results.json")');
  writeFileSync(join(report, "data/results.json"), '{"value":42}');
  const image = Buffer.alloc(6 * 1024 * 1024);
  image.set([137, 80, 78, 71]);
  writeFileSync(join(report, "plot.png"), image);
  const preview = createArtifactPreview(dataDir);
  try {
    const url = await preview.url(dirs.sessionId, "workspace", "analysis report/index.html");
    const html = await fetch(url);
    assert.match(await html.text(), /app.js/);
    assert.equal(html.headers.get("content-security-policy"), null);
    const js = await fetch(new URL("app.js", url));
    assert.match(js.headers.get("content-type") ?? "", /javascript/);
    assert.match(await js.text(), /fetch/);
    const json = await fetch(new URL("data/results.json", url));
    assert.deepEqual(await json.json(), { value: 42 });
    const png = await fetch(new URL("plot.png", url));
    assert.equal(png.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await png.arrayBuffer()), image);
    writeFileSync(join(report, "data/results.json"), '{"value":43}');
    assert.deepEqual(await (await fetch(new URL("data/results.json", url))).json(), { value: 43 });
    await assert.rejects(preview.url(dirs.sessionId, "workspace", "../records/anything"), /inside/);
  } finally {
    preview.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
