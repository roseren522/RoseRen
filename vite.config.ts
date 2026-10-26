import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "fieldnotes-offline-shell",
      generateBundle(_options, bundle) {
        const assets = [
          "/",
          "/icon.svg",
          "/manifest.webmanifest",
          ...Object.keys(bundle).map((name) => "/" + name),
        ];
        const version = createHash("sha256")
          .update(JSON.stringify(assets))
          .digest("hex")
          .slice(0, 12);
        const worker = readFileSync(
          new URL("./src/service-worker.js", import.meta.url),
          "utf8",
        )
          .replace("__CACHE_VERSION__", version)
          .replace("__PRECACHE_ASSETS__", JSON.stringify(assets));
        this.emitFile({ type: "asset", fileName: "sw.js", source: worker });
      },
    },
  ],
  server: { host: "0.0.0.0", port: 5173 },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "cloud", test: /node_modules\/@supabase/ },
            {
              name: "react",
              test: /node_modules\/(react|react-dom|scheduler)\//,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
