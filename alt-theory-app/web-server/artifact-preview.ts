import express from "express";
import { createServer } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { isHtmlPath, isImagePath } from "../shared/artifact-types.js";
import { samePath } from "../core/path-verdict.js";
import { resolveSessionReadableFile } from "./session-store.js";
import { resolveWorkingReadableFile, type WorkingFileOwner } from "./workspace-files.js";

/** File resources only: executable reports never share the application's API origin. */
export function createArtifactPreview(dataDir: string) {
  const app = express();
  const token = randomBytes(24).toString("hex");
  const draftSecret = randomBytes(24);
  const localToken = (scope: string) => createHmac("sha256", draftSecret).update(`desktop:${scope}`).digest("hex");
  const server = createServer(app);
  let listening: Promise<string> | undefined;
  const draftToken = (scope: string) => createHmac("sha256", draftSecret).update(scope).digest("hex");
  const resolveFile = (owner: WorkingFileOwner, root: string, path: string) => {
    const target = root === "working"
      ? resolveWorkingReadableFile(dataDir, owner, path).target
      : resolveSessionReadableFile(dataDir, typeof owner === "string" ? owner : "", root, path).path;
    if (!statSync(target).isFile()) throw new Error("File not found");
    return target;
  };
  app.use((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") { res.sendStatus(405); return; }
    try {
      const [key, scope, root, ...parts] = new URL(req.url, "http://localhost").pathname.slice(1).split("/").map(decodeURIComponent);
      if (!scope || !root || !parts.length) { res.sendStatus(404); return; }
      let target: string;
      if (scope === "desktop") {
        if (key !== localToken(root)) { res.sendStatus(404); return; }
        const entry = realpathSync(root);
        // The chosen file is directly readable. Relative resources in an HTML
        // preview resolve from its directory on the separate preview origin.
        const base = dirname(entry);
        const requested = parts.join("/");
        target = requested === basename(root) ? entry : realpathSync(resolve(dirname(root), requested));
        const fromBase = relative(base, target);
        if (target !== entry && (!isHtmlPath(root) || isAbsolute(fromBase) || fromBase.split(sep)[0] === "..")) {
          res.sendStatus(404); return;
        }
      } else {
        const draft = scope.startsWith("draft:");
        if (draft ? key !== draftToken(scope) || root !== "working" : key !== token) { res.sendStatus(404); return; }
        const owner = draft ? { primaryDir: scope.slice("draft:".length) || null } : scope;
        target = resolveFile(owner, root, parts.join("/"));
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(target, { dotfiles: "allow" });
    } catch { res.sendStatus(404); }
  });
  const url = async (key: string, scope: string, root: string, parts: string[]) => {
    listening ??= new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") { reject(new Error("Preview server unavailable")); return; }
        resolve("http://127.0.0.1:" + address.port);
      });
    });
    const origin = await listening;
    return origin + "/" + [key, scope, root, ...parts].map(encodeURIComponent).join("/");
  };
  const scopedUrl = (owner: WorkingFileOwner, root: string, path: string) => {
    const scope = typeof owner === "string" ? owner : `draft:${owner.primaryDir ?? ""}`;
    return url(typeof owner === "string" ? token : draftToken(scope), scope, root, path.replace(/\\/g, "/").split("/"));
  };
  return {
    async url(owner: WorkingFileOwner, root: string, path: string): Promise<string> {
      resolveFile(owner, root, path);
      return scopedUrl(owner, root, path);
    },
    async desktopUrl(path: string, source?: { owner: WorkingFileOwner; root: string; path: string }): Promise<string> {
      if (!isAbsolute(path) || !(isHtmlPath(path) || isImagePath(path)) || !statSync(path).isFile()) {
        throw new Error("The current file has no rendered preview.");
      }
      if (source) {
        // Preserve relative resources for files with an existing project address.
        try {
          const target = resolveFile(source.owner, source.root, source.path);
          if (samePath(path, target)) return scopedUrl(source.owner, source.root, source.path);
        } catch { /* Render the chosen file through its local URL. */ }
      }
      const target = resolve(path);
      return url(localToken(target), "desktop", target, [basename(target)]);
    },
    close() { server.close(); server.closeAllConnections(); },
  };
}
