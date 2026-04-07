import { context, propagation } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import { registerLatitudeInstrumentations } from "./instrumentations.ts"
import { LatitudeSpanProcessor } from "./processor.ts"
import type { InitLatitudeOptions } from "./types.ts"

const SERVICE_NAME = process.env.npm_package_name || "unknown"

/** Module-level flag to prevent duplicate signal handler registration on repeated initLatitude calls */
let shutdownHandlersRegistered = false

export function initLatitude(options: InitLatitudeOptions): {
  provider: NodeTracerProvider
  flush: () => Promise<void>
  shutdown: () => Promise<void>
  ready: Promise<void>
} {
  const { apiKey, projectSlug, instrumentations = [], ...processorOptions } = options

  if (!apiKey || apiKey.trim() === "") {
    throw new Error("[Latitude] apiKey is required and cannot be empty")
  }
  if (!projectSlug || projectSlug.trim() === "") {
    throw new Error("[Latitude] projectSlug is required and cannot be empty")
  }

  const contextManager = new AsyncLocalStorageContextManager()
  contextManager.enable()

  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  })

  context.setGlobalContextManager(contextManager)
  propagation.setGlobalPropagator(propagator)

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
    }),
    spanProcessors: [new LatitudeSpanProcessor(apiKey, projectSlug, processorOptions)],
  })

  provider.register()

  const ready = registerLatitudeInstrumentations({
    instrumentations,
    tracerProvider: provider,
  }).catch((err) => {
    console.warn("[Latitude] Failed to register instrumentations:", err)
  })

  const shutdown = async (): Promise<void> => {
    await provider.shutdown()
  }

  const flush = async (): Promise<void> => {
    await provider.forceFlush()
  }

  const handleShutdown = async () => {
    try {
      await shutdown()
    } catch (err) {
      console.error("Error during Latitude Telemetry shutdown:", err)
    }
  }

  if (!shutdownHandlersRegistered) {
    process.once("SIGTERM", handleShutdown)
    process.once("SIGINT", handleShutdown)
    shutdownHandlersRegistered = true
  }

  return {
    provider,
    flush,
    shutdown,
    ready,
  }
}
