import express from "express";
import { createServer } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import { resolveSessionReadableFile } from "./session-store.js";
import { resolveWorkingReadableFile, type WorkingFileOwner } from "./workspace-files.js";

/** File resources only: executable reports never share the application's API origin. */
export function createArtifactPreview(dataDir: string) {
  const app = express();
  const token = randomBytes(24).toString("hex");
  const draftSecret = randomBytes(24);
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
      const draft = scope.startsWith("draft:");
      if (draft ? key !== draftToken(scope) || root !== "working" : key !== token) { res.sendStatus(404); return; }
      const owner = draft ? { primaryDir: scope.slice("draft:".length) || null } : scope;
      const target = resolveFile(owner, root, parts.join("/"));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(target, { dotfiles: "allow" });
    } catch { res.sendStatus(404); }
  });
  return {
    async url(owner: WorkingFileOwner, root: string, path: string): Promise<string> {
      resolveFile(owner, root, path);
      listening ??= new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") { reject(new Error("Preview server unavailable")); return; }
          resolve("http://127.0.0.1:" + address.port);
        });
      });
      const origin = await listening;
      const scope = typeof owner === "string" ? owner : `draft:${owner.primaryDir ?? ""}`;
      const key = typeof owner === "string" ? token : draftToken(scope);
      return origin + "/" + [key, scope, root, ...path.replace(/\\/g, "/").split("/")].map(encodeURIComponent).join("/");
    },
    close() { server.close(); server.closeAllConnections(); },
  };
}
