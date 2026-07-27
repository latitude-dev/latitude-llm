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
import { pdfjsAssets } from "./vite-plugins/pdfjs-assets.ts"

const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
const envFilePath = fileURLToPath(new URL(`../../.env.${nodeEnv}`, import.meta.url))

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath, quiet: true })
}

const webPortNumber = Effect.runSync(parseEnv("LAT_WEB_PORT", "number", 3000))
const bundleAnalyze = Effect.runSync(parseEnv("LAT_WEB_BUNDLE_ANALYZE", "boolean", false))
const oauthConsentContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: http:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "navigate-to https: http://localhost:* http://127.0.0.1:* http://[::1]:*",
].join("; ")

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

// quickjs-emscripten's glue loads its .wasm via `new URL(…, import.meta.url)`, so it must stay external to resolve from node_modules, not the bundled `_ssr/` chunk.
const quickjsExternal: (string | RegExp)[] = [/^quickjs-emscripten(-core)?$/, /^@jitl\/quickjs-/]

// @effect/opentelemetry ships a WebSdk.js entry that imports from
// @opentelemetry/sdk-trace-web (an optional peer, browser-only). The SSR
// bundle never reaches the web SDK path, but Rolldown's resolver scans it.
// Externalize so Rolldown does not attempt to resolve the missing peer.
//
// @resvg/resvg-js ships a native .node binding (loaded via `require` at
// runtime). Bundlers cannot read .node files, so it must stay external in
// both the Vite SSR pass and the Nitro production bundle.
const ssrExternal: (string | RegExp)[] = [
  ...temporalExternal,
  ...quickjsExternal,
  "@opentelemetry/sdk-trace-web",
  "@resvg/resvg-js",
]

export default defineConfig({
  // Nitro server bundle uses its own sourcemap flag (Vite `build.sourcemap` is client-only).
  plugins: [
    tanstackStart(),
    nitro({
      sourcemap: true,
      routeRules: {
        "/auth/consent": {
          headers: {
            "Content-Security-Policy": oauthConsentContentSecurityPolicy,
          },
        },
        // Version-scoped path, so the pdf.js font/cmap/wasm payloads never go stale.
        "/pdfjs/**": {
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
          },
        },
      },
      rollupConfig: { external: ssrExternal },
      rolldownConfig: { external: ssrExternal },
    }),
    tailwindcss(),
    react(),
    pdfjsAssets(),
  ],
  ssr: {
    external: [
      "@temporalio/client",
      "@temporalio/proto",
      "@grpc/grpc-js",
      "protobufjs",
      "long",
      "@opentelemetry/sdk-trace-web",
      "@resvg/resvg-js",
      "quickjs-emscripten",
      "quickjs-emscripten-core",
      "@jitl/quickjs-ffi-types",
      "@jitl/quickjs-wasmfile-release-sync",
    ],
  },
  optimizeDeps: {
    exclude: ["@resvg/resvg-js"],
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
              // The Effect runtime leaks into the client bundle via shared domain/server-fn
              // modules and is the single largest vendor in the entry chunk. Peel it into its
              // own cacheable chunk so `main` stays under the client-asset size budget.
              test: /node_modules\/effect\//,
              name: "effect",
            },
            {
              // TanStack router core is a large, stable vendor loaded on every page; keeping it
              // in its own chunk trims the entry chunk and caches across deploys.
              test: /node_modules\/@tanstack\/(router-core|react-router|history)\//,
              name: "tanstack-router",
            },
            {
              // Base UI and Radix are the two largest vendors inside the `@repo/ui` barrel chunk,
              // which sits within a few hundred bytes of the client-asset size budget. Peeling them
              // into their own stable chunks keeps the barrel well under the limit and caches the
              // primitives across deploys.
              test: /node_modules\/@base-ui\//,
              name: "base-ui",
            },
            {
              test: /node_modules\/@radix-ui\//,
              name: "radix-ui",
            },
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
              // Only reachable through the lazily-imported PDF viewer. Pinned to a stable chunk
              // name so the bundle-size allowlist key never tracks a component filename.
              test: /node_modules\/pdfjs-dist\//,
              name: "pdfjs",
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
