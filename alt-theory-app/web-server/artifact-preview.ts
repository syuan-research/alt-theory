import express from "express";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import { resolveSessionReadableFile } from "./session-store.js";
import { resolveWorkingReadableFile } from "./workspace-files.js";

/** File resources only: executable reports never share the application's API origin. */
export function createArtifactPreview(dataDir: string) {
  const app = express();
  const token = randomBytes(24).toString("hex");
  const server = createServer(app);
  let listening: Promise<string> | undefined;
  const resolveFile = (sessionId: string, root: string, path: string) => {
    const target = root === "working"
      ? resolveWorkingReadableFile(dataDir, sessionId, path).target
      : resolveSessionReadableFile(dataDir, sessionId, root, path).path;
    if (!statSync(target).isFile()) throw new Error("File not found");
    return target;
  };
  app.use((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") { res.sendStatus(405); return; }
    try {
      const [key, sessionId, root, ...parts] = new URL(req.url, "http://localhost").pathname.slice(1).split("/").map(decodeURIComponent);
      if (key !== token || !sessionId || !root || !parts.length) { res.sendStatus(404); return; }
      const target = resolveFile(sessionId, root, parts.join("/"));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(target, { dotfiles: "allow" });
    } catch { res.sendStatus(404); }
  });
  return {
    async url(sessionId: string, root: string, path: string): Promise<string> {
      resolveFile(sessionId, root, path);
      listening ??= new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") { reject(new Error("Preview server unavailable")); return; }
          resolve("http://127.0.0.1:" + address.port);
        });
      });
      const origin = await listening;
      return origin + "/" + [token, sessionId, root, ...path.replace(/\\/g, "/").split("/")].map(encodeURIComponent).join("/");
    },
    close() { server.close(); server.closeAllConnections(); },
  };
}
