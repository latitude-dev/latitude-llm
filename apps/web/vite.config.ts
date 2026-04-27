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

// @temporalio/client ships protobufjs runtime codegen and @grpc/grpc-js. The two
// packages hold references to each other's module instances, so partial bundling
// (protobufjs bundled, grpc-js external) breaks gRPC status deserialization and
// produces "undefined undefined: undefined" errors at connect time.
// Externalize the entire Temporal dep tree so Node loads one coherent copy at
// runtime. See `.npmrc` public-hoist-pattern for the matching pnpm hoisting.
const temporalExternal: (string | RegExp)[] = [
  /^@temporalio\//,
  /^@grpc\//,
  /^protobufjs(\/.*)?$/,
  /^@protobufjs\//,
  "long",
]

// @effect/opentelemetry ships a WebSdk.js entry that imports from
// @opentelemetry/sdk-trace-web (an optional peer, browser-only). The SSR
// bundle never reaches the web SDK path, but Rolldown's resolver scans it.
// Externalize so Rolldown does not attempt to resolve the missing peer.
const ssrExternal: (string | RegExp)[] = [
  ...temporalExternal,
  "@opentelemetry/sdk-trace-web",
]

export default defineConfig({
  // Nitro server bundle uses its own sourcemap flag (Vite `build.sourcemap` is client-only).
  plugins: [
    tanstackStart(),
    nitro({
      sourcemap: true,
      rollupConfig: { external: ssrExternal },
      rolldownConfig: { external: ssrExternal },
    }),
    tailwindcss(),
    react(),
  ],
  ssr: {
    external: [
      "@temporalio/client",
      "@temporalio/proto",
      "@grpc/grpc-js",
      "protobufjs",
      "long",
      "@opentelemetry/sdk-trace-web",
    ],
  },
  resolve: {
    conditions: ["source", "browser"],
    alias: {
      // tslib's CJS UMD sets __esModule: true without providing a default
      // export, which breaks Vite 8 / Rolldown's consistent CJS interop.
      // Alias to the native ESM build to avoid the interop entirely.
      tslib: "tslib/tslib.es6.mjs",
    },
  },
  build: {
    sourcemap: true,
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
