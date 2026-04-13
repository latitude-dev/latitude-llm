/**
 * Browser entry point for @repo/observability.
 *
 * This file is selected over index.ts when the package is resolved in a
 * browser context. It is wired up via the "browser" condition in package.json:
 *
 *   "exports": { ".": { "browser": "./src/browser.ts", "node": "./src/index.ts" } }
 *
 * Vite includes "browser" in its default resolve conditions for client builds,
 * so it automatically picks this file instead of index.ts when bundling for
 * the browser (dev server and production).
 *
 * WHY THIS EXISTS:
 * index.ts imports otel.ts, which in turn imports Node.js-only OTel packages
 * (@opentelemetry/sdk-node, @opentelemetry/auto-instrumentations-node, etc.).
 * Those packages use Node.js APIs (e.g. util.inherits) at module evaluation
 * time, so loading them in the browser throws immediately.
 *
 * TanStack Start includes start.ts in the client bundle (with server callback
 * bodies stripped but module-level imports preserved), so @repo/observability
 * ends up in the browser module graph. This file provides a safe, no-op
 * alternative: same public API, no Node.js-only dependencies.
 *
 * @opentelemetry/api is intentionally kept — it is isomorphic and safe to use
 * in the browser (it provides no-op stubs when no SDK is initialised).
 */
import type { Span, Tracer } from "@opentelemetry/api"
import { SpanStatusCode, trace } from "@opentelemetry/api"
import { createLogger as createLoggerWithState } from "./logger.ts"
import { getObservabilityState } from "./state.ts"
import type { InitializeObservabilityOptions } from "./types.ts"

export type { Span, Tracer }
export { recordSpanExceptionForDatadog } from "./record-span-exception.ts"
export { trace, SpanStatusCode }

export const createLogger = (scope: string) => createLoggerWithState(getObservabilityState(), scope)
export const initializeObservability = async (_opts: InitializeObservabilityOptions): Promise<void> => {}
export const shutdownObservability = async (): Promise<void> => {}
