import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backendOrigin = process.env.ALT_THEORY_BACKEND_URL ?? "http://127.0.0.1:3000";
const appVersion = (JSON.parse(
  readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"),
) as { version: string }).version;

function nodeModulesAllow(): string[] {
  const local = path.resolve(__dirname, "node_modules");
  try {
    const real = realpathSync(local);
    return real === local ? [local] : [local, real];
  } catch {
    return [local];
  }
}

export default defineConfig({
  define: {
    __ALT_THEORY_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, "../.."), ...nodeModulesAllow()],
    },
    proxy: {
      "/api": {
        target: backendOrigin,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../web-server/public-v6",
    emptyOutDir: true,
  },
});
