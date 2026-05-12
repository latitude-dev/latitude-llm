import { context, propagation, type TracerProvider, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { NodeTracerProvider, type SpanProcessor } from "@opentelemetry/sdk-trace-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import { registerLatitudeInstrumentations } from "./instrumentations.ts"
import { LatitudeSpanProcessor } from "./processor.ts"
import type { InitLatitudeOptions, LatitudeOptions } from "./types.ts"

const SERVICE_NAME = process.env.npm_package_name || "unknown"

/** Module-level flag to prevent duplicate signal handler registration on repeated Latitude construction */
let shutdownHandlersRegistered = false

interface ProxyTracerProviderLike extends TracerProvider {
  getDelegate?: () => TracerProvider
}

interface ProviderWithSpanProcessor extends TracerProvider {
  addSpanProcessor?: (processor: SpanProcessor) => void
  _activeSpanProcessor?: {
    _spanProcessors?: SpanProcessor[]
  }
  _activeProcessor?: {
    _processors?: SpanProcessor[]
  }
}

function getRegisteredTracerProvider(): TracerProvider | undefined {
  const provider = trace.getTracerProvider() as ProxyTracerProviderLike
  const delegate = provider.getDelegate?.() ?? provider

  return delegate.constructor.name === "NoopTracerProvider" ? undefined : delegate
}

function addSpanProcessor(provider: TracerProvider, processor: SpanProcessor): boolean {
  const providerWithProcessor = provider as ProviderWithSpanProcessor

  if (typeof providerWithProcessor.addSpanProcessor === "function") {
    providerWithProcessor.addSpanProcessor(processor)
    return true
  }

  // OTel JS v2 removed the public addSpanProcessor API. Sentry, New Relic, Honeycomb,
  // and NodeSDK-based setups still keep processors in this MultiSpanProcessor array.
  const otelSpanProcessors = providerWithProcessor._activeSpanProcessor?._spanProcessors
  if (Array.isArray(otelSpanProcessors)) {
    otelSpanProcessors.push(processor)
    return true
  }

  // Datadog's OTel bridge stores processors on `_activeProcessor`.
  const datadogSpanProcessors = providerWithProcessor._activeProcessor?._processors
  if (Array.isArray(datadogSpanProcessors)) {
    datadogSpanProcessors.push(processor)
    return true
  }

  return false
}

export class Latitude {
  readonly provider: TracerProvider
  readonly ready: Promise<void>

  private readonly latitudeProcessor: LatitudeSpanProcessor
  private readonly ownsProvider: boolean

  constructor(options: LatitudeOptions) {
    const { apiKey, projectSlug, instrumentations = [], tracerProvider, ...processorOptions } = options

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("[Latitude] apiKey is required and cannot be empty")
    }
    if (!projectSlug || projectSlug.trim() === "") {
      throw new Error("[Latitude] projectSlug is required and cannot be empty")
    }

    this.latitudeProcessor = new LatitudeSpanProcessor(apiKey, projectSlug, processorOptions)
    const existingProvider = tracerProvider ?? getRegisteredTracerProvider()

    if (existingProvider && addSpanProcessor(existingProvider, this.latitudeProcessor)) {
      this.provider = existingProvider
      this.ownsProvider = false
    } else {
      const contextManager = new AsyncLocalStorageContextManager()
      contextManager.enable()

      const propagator = new CompositePropagator({
        propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
      })

      if (!existingProvider) {
        context.setGlobalContextManager(contextManager)
        propagation.setGlobalPropagator(propagator)
      }

      const resourceServiceName =
        typeof processorOptions.serviceName === "string" && processorOptions.serviceName.trim() !== ""
          ? processorOptions.serviceName.trim()
          : SERVICE_NAME

      const latitudeProvider = new NodeTracerProvider({
        resource: resourceFromAttributes({
          [ATTR_SERVICE_NAME]: resourceServiceName,
        }),
        spanProcessors: [this.latitudeProcessor],
      })

      if (!existingProvider) {
        latitudeProvider.register()
      }

      this.ownsProvider = true
      this.provider = latitudeProvider
    }

    this.ready = registerLatitudeInstrumentations({
      instrumentations,
      tracerProvider: this.provider,
    }).catch((err) => {
      console.warn("[Latitude] Failed to register instrumentations:", err)
    })

    if (!shutdownHandlersRegistered) {
      process.once("SIGTERM", () => void this.handleShutdown())
      process.once("SIGINT", () => void this.handleShutdown())
      shutdownHandlersRegistered = true
    }
  }

  async shutdown(): Promise<void> {
    if (this.ownsProvider && this.provider instanceof NodeTracerProvider) {
      await this.provider.shutdown()
      return
    }

    await this.latitudeProcessor.shutdown()
  }

  async flush(): Promise<void> {
    if (this.ownsProvider && this.provider instanceof NodeTracerProvider) {
      await this.provider.forceFlush()
      return
    }

    await this.latitudeProcessor.forceFlush()
  }

  private async handleShutdown(): Promise<void> {
    try {
      await this.shutdown()
    } catch (err) {
      console.error("Error during Latitude Telemetry shutdown:", err)
    }
  }
}

/**
 * @deprecated Use `new Latitude(options)` instead.
 */
export function initLatitude(options: InitLatitudeOptions): Latitude {
  return new Latitude(options)
}
