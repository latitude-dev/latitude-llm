import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseEnv } from "@platform/env"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { nitro } from "nitro/vite"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig } from "vite"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const webPortNumber = Effect.runSync(parseEnv("LAT_WEB_PORT", "number", 3000))
const bundleAnalyze = Effect.runSync(parseEnv("LAT_WEB_BUNDLE_ANALYZE", "boolean", false))

/** Strip "use client" / "use server" so Rollup doesn't error when merging modules (Next.js-only directives). */
function stripUseDirectives() {
  return {
    name: "strip-use-directives",
    transform(code: string, id: string) {
      if (id.includes("node_modules") && /^\s*["']use (client|server)["']\s*;?\s*\n/.test(code)) {
        return { code: code.replace(/^\s*["']use (client|server)["']\s*;?\s*\n?/, ""), map: null }
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [
    stripUseDirectives(),
    tanstackStart({ start: { entry: "./src/start.ts" } }),
    nitro(),
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      // tslib's CJS UMD sets __esModule: true without providing a default
      // export, which breaks Vite 8 / Rolldown's consistent CJS interop.
      // Alias to the native ESM build to avoid the interop entirely.
      tslib: "tslib/tslib.es6.mjs",
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              test: /node_modules\/codemirror/,
              name: "codemirror",
            },
            {
              test: /node_modules\/echarts-for-react\//,
              name: "echarts-react",
            },
            {
              test: /node_modules\/echarts\//,
              name: "echarts",
            },
            {
              test: /node_modules\/react/,
              name: "react",
            },
            {
              test: /node_modules\/react-dom/,
              name: "react-dom",
            },
            {
              test: /node_modules\/zod/,
              name: "zod",
            },
          ],
        },
      },
    },
    rollupOptions: {
      plugins: bundleAnalyze
        ? [
            visualizer({
              emitFile: true,
              filename: "bundle-analysis.html",
              template: "treemap",
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
          ]
        : [],
    },
  },
  server:
    nodeEnv === "development"
      ? {
          port: webPortNumber,
          strictPort: true,
          allowedHosts: true,
        }
      : {
          port: webPortNumber,
          strictPort: true,
        },
})
