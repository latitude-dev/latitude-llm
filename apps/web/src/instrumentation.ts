// OpenTelemetry instrumentation for TanStack Start
// This MUST be the first import in start.ts to ensure proper initialization
// See: https://tanstack.com/start/latest/docs/framework/react/observability
//
// NOTE: Why we don't use @repo/observability here:
//
// The @repo/observability package provides initializeObservability() which uses
// dynamic imports to load OTel modules. However, TanStack Start + Vite bundling
// has special requirements:
//
// 1. NodeSDK must be imported FIRST - It patches Node.js built-in modules (http, fs, etc.)
//    at module load time. If these modules are already loaded before OTel initializes,
//    they can't be instrumented.
//
// 2. Dynamic imports happen too late - By the time initializeObservability() async loads
//    the OTel modules, TanStack Start has already loaded its server modules.
//
// 3. Vite bundling breaks NodeSDK - The NodeSDK uses native Node.js require() patches
//    that don't work with Vite's ES module bundling system.
//
// Therefore, web uses inline OTel setup here, while api/ingest/workers use
// @repo/observability (they don't have Vite bundling issues).

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"

const endpoint = Effect.runSync(
  parseEnv("LAT_OBSERVABILITY_OTLP_TRACES_ENDPOINT", "string", "http://localhost:4318/v1/traces"),
)
const enabled = Effect.runSync(parseEnv("LAT_OBSERVABILITY_ENABLED", "boolean", false))

if (enabled && typeof window === "undefined") {
  const sdk = new NodeSDK({
    serviceName: "web",
    traceExporter: new OTLPTraceExporter({
      url: endpoint,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  })

  sdk.start()

  // Graceful shutdown
  process.on("SIGTERM", () => {
    sdk.shutdown().catch(console.error)
  })
}
