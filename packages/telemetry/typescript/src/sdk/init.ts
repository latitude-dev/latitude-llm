import { context, ProxyTracerProvider, propagation, type TracerProvider, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { NodeTracerProvider, type SpanProcessor } from "@opentelemetry/sdk-trace-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import { registerLatitudeInstrumentations } from "./instrumentations.ts"
import { LatitudeSpanProcessor } from "./processor.ts"
import type { InitLatitudeOptions, LatitudeOptions } from "./types.ts"

const SERVICE_NAME = process.env.npm_package_name || "unknown"
const DETECT_PROBE = "@latitude-data/telemetry-detect"

/** Module-level flag to prevent duplicate signal handler registration on repeated Latitude construction */
let shutdownHandlersRegistered = false

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
  const provider = trace.getTracerProvider()

  // The OTel global is a ProxyTracerProvider that's installed at module load. `getDelegateTracer`
  // returns `undefined` when nothing has been registered behind the proxy — this is the public way
  // to detect "no global provider set" without reaching into `constructor.name` or private state.
  if (provider instanceof ProxyTracerProvider) {
    return provider.getDelegateTracer(DETECT_PROBE) === undefined ? undefined : provider.getDelegate()
  }

  return provider
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
    const { apiKey, projectSlug, instrumentations = [], tracerProvider, ...processorOptionsRaw } = options

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("[Latitude] apiKey is required and cannot be empty")
    }

    const targetProvider = tracerProvider ?? getRegisteredTracerProvider()

    // `serviceName` is a Latitude-owned-provider concern. When piggy-backing on an existing
    // provider, the host's resource is the source of truth for `service.name`; overriding it
    // would silently relabel spans the host SDK is also processing. Strip it here so the
    // exporter wrapper inside LatitudeSpanProcessor is not installed in the piggy-back path.
    let processorOptions = processorOptionsRaw
    if (targetProvider) {
      const { serviceName: _ignored, ...rest } = processorOptionsRaw
      processorOptions = rest
    }

    this.latitudeProcessor = new LatitudeSpanProcessor(apiKey, projectSlug, processorOptions)
    const attached = targetProvider ? addSpanProcessor(targetProvider, this.latitudeProcessor) : false

    if (targetProvider && !attached) {
      const source = tracerProvider ? "the provider passed via `tracerProvider`" : "the global OpenTelemetry provider"
      console.warn(
        `[Latitude] Could not attach LatitudeSpanProcessor to ${source}: it exposes neither ` +
          "`addSpanProcessor` nor a known internal span-processor list (OTel JS v2 / Datadog). " +
          "Falling back to a Latitude-owned provider that is NOT registered globally — instrumentations " +
          "will still send spans to Latitude, but the host SDK's spans will not. To fix, pass a provider " +
          "exposing `addSpanProcessor` or attach `LatitudeSpanProcessor` to your provider manually.",
      )
    }

    if (targetProvider && attached) {
      this.provider = targetProvider
      this.ownsProvider = false
    } else {
      // We only install global context manager + propagator when no provider was discovered or
      // explicitly passed — otherwise the host SDK already owns those, and replacing them would
      // break their propagation pipeline.
      if (!targetProvider) {
        const contextManager = new AsyncLocalStorageContextManager()
        contextManager.enable()
        context.setGlobalContextManager(contextManager)
        propagation.setGlobalPropagator(
          new CompositePropagator({
            propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
          }),
        )
      }

      const resourceServiceName =
        typeof processorOptionsRaw.serviceName === "string" && processorOptionsRaw.serviceName.trim() !== ""
          ? processorOptionsRaw.serviceName.trim()
          : SERVICE_NAME

      const latitudeProvider = new NodeTracerProvider({
        resource: resourceFromAttributes({
          [ATTR_SERVICE_NAME]: resourceServiceName,
        }),
        spanProcessors: [this.latitudeProcessor],
      })

      if (!targetProvider) {
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
