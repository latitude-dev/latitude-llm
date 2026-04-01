import * as otel from "@opentelemetry/api"
import { context, propagation, type TextMapPropagator } from "@opentelemetry/api"
import { ALLOW_ALL_BAGGAGE_KEYS, BaggageSpanProcessor } from "@opentelemetry/baggage-span-processor"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { Resource } from "@opentelemetry/resources"
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  SimpleSpanProcessor,
  type SpanExporter,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import { AnthropicInstrumentation } from "@traceloop/instrumentation-anthropic"
import { BedrockInstrumentation } from "@traceloop/instrumentation-bedrock"
import { CohereInstrumentation } from "@traceloop/instrumentation-cohere"
import { LangChainInstrumentation } from "@traceloop/instrumentation-langchain"
import { LlamaIndexInstrumentation } from "@traceloop/instrumentation-llamaindex"
import { OpenAIInstrumentation } from "@traceloop/instrumentation-openai"
import { TogetherInstrumentation } from "@traceloop/instrumentation-together"
import { AIPlatformInstrumentation, VertexAIInstrumentation } from "@traceloop/instrumentation-vertexai"
import { ATTRIBUTES, SCOPE_LATITUDE } from "../constants/index.ts"
import { env } from "../env/index.ts"
import { type BaseInstrumentation, type CaptureOptions, ManualInstrumentation } from "../instrumentations/index.ts"
import { DEFAULT_REDACT_SPAN_PROCESSOR } from "./redact.ts"

const TRACES_URL = `${env.EXPORTER_URL}/v1/traces`
const SERVICE_NAME = process.env.npm_package_name || "unknown"
const SCOPE_VERSION = process.env.npm_package_version || "unknown"

export type TelemetryContext = otel.Context

class ContextManager {
  private readonly telemetry: ManualInstrumentation

  constructor(telemetry: ManualInstrumentation) {
    this.telemetry = telemetry
  }

  resume(ctx: { traceparent: string; baggage?: string }) {
    return this.telemetry.resume(ctx)
  }

  active() {
    return context.active()
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    ctx: TelemetryContext,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return context.with(ctx, fn, thisArg, ...args)
  }
}

class InstrumentationManager {
  private readonly instrumentations: BaseInstrumentation[]

  constructor(instrumentations: BaseInstrumentation[]) {
    this.instrumentations = instrumentations
  }

  enable() {
    for (const instrumentation of this.instrumentations) {
      if (!instrumentation.isEnabled()) instrumentation.enable()
    }
  }

  disable() {
    for (const instrumentation of this.instrumentations) {
      if (instrumentation.isEnabled()) instrumentation.disable()
    }
  }
}

class TracerManager {
  private readonly nodeProvider: NodeTracerProvider
  private readonly scopeVersion: string

  constructor(nodeProvider: NodeTracerProvider, scopeVersion: string) {
    this.nodeProvider = nodeProvider
    this.scopeVersion = scopeVersion
  }

  get(scope: Instrumentation) {
    return this.provider(scope).getTracer("")
  }

  provider(scope: Instrumentation) {
    return new ScopedTracerProvider(`${SCOPE_LATITUDE}.${scope}`, this.scopeVersion, this.nodeProvider)
  }
}

class ScopedTracerProvider implements otel.TracerProvider {
  private readonly scope: string
  private readonly version: string
  private readonly provider: otel.TracerProvider

  constructor(scope: string, version: string, provider: otel.TracerProvider) {
    this.scope = scope
    this.version = version
    this.provider = provider
  }

  getTracer(_name: string, _version?: string, options?: otel.TracerOptions) {
    return this.provider.getTracer(this.scope, this.version, options)
  }
}

class LifecycleManager {
  private readonly nodeProvider: NodeTracerProvider
  private readonly exporter: SpanExporter

  constructor(nodeProvider: NodeTracerProvider, exporter: SpanExporter) {
    this.nodeProvider = nodeProvider
    this.exporter = exporter
  }

  async flush() {
    await this.nodeProvider.forceFlush()
    await this.exporter.forceFlush?.()
  }

  async shutdown() {
    await this.flush()
    await this.nodeProvider.shutdown()
    await this.exporter.shutdown?.()
  }
}

export const DEFAULT_SPAN_EXPORTER = (apiKey: string, projectSlug: string) =>
  new OTLPTraceExporter({
    url: TRACES_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Latitude-Project": projectSlug,
    },
    timeoutMillis: 30 * 1000,
  })

export enum Instrumentation {
  Anthropic = "anthropic",
  AIPlatform = "aiplatform",
  Bedrock = "bedrock",
  Cohere = "cohere",
  Langchain = "langchain",
  LlamaIndex = "llamaindex",
  Manual = "manual",
  OpenAI = "openai",
  TogetherAI = "togetherai",
  VertexAI = "vertexai",
}

export type TelemetryOptions = {
  serviceName?: string
  disableBatch?: boolean
  exporter?: SpanExporter
  processors?: SpanProcessor[]
  propagators?: TextMapPropagator[]
  instrumentations?: {
    [Instrumentation.AIPlatform]?: unknown
    [Instrumentation.Anthropic]?: unknown
    [Instrumentation.Bedrock]?: unknown
    [Instrumentation.Cohere]?: unknown
    [Instrumentation.OpenAI]?: unknown
    [Instrumentation.LlamaIndex]?: unknown
    [Instrumentation.TogetherAI]?: unknown
    [Instrumentation.VertexAI]?: unknown
    [Instrumentation.Langchain]?: {
      callbackManagerModule?: unknown
    }
  }
}

export class LatitudeTelemetry {
  private options: TelemetryOptions
  private nodeProvider: NodeTracerProvider
  private instrumentationsList: BaseInstrumentation[]

  /** OpenTelemetry tracer for creating custom spans. */
  readonly tracer: otel.Tracer
  readonly context: ContextManager
  readonly instrumentation: InstrumentationManager
  private readonly lifecycle: LifecycleManager

  constructor(apiKey: string, projectSlug: string, options?: TelemetryOptions) {
    this.options = options || {}

    if (!this.options.exporter) {
      this.options.exporter = DEFAULT_SPAN_EXPORTER(apiKey, projectSlug)
    }

    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())

    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [...(this.options.propagators || []), new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
      }),
    )

    const spanProcessors: SpanProcessor[] = [
      // Must run before the exporter span processors
      new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
      ...(this.options.processors ?? [DEFAULT_REDACT_SPAN_PROCESSOR()]),
      this.options.disableBatch
        ? new SimpleSpanProcessor(this.options.exporter)
        : new BatchSpanProcessor(this.options.exporter),
    ]

    this.nodeProvider = new NodeTracerProvider({
      resource: new Resource({ [ATTR_SERVICE_NAME]: this.options.serviceName || SERVICE_NAME }),
      spanProcessors,
    })

    this.lifecycle = new LifecycleManager(this.nodeProvider, this.options.exporter)

    this.nodeProvider.register()

    process.on("SIGTERM", async () => this.shutdown)
    process.on("SIGINT", async () => this.shutdown)

    this.instrumentationsList = []
    const tracerManager = new TracerManager(this.nodeProvider, SCOPE_VERSION)

    // Manual instrumentation for context management
    const manualTracer = tracerManager.get(Instrumentation.Manual)
    const manualInstrumentation = new ManualInstrumentation(manualTracer)
    this.instrumentationsList.push(manualInstrumentation)

    // Expose tracer for custom span creation
    this.tracer = manualTracer

    this.initProviderInstrumentations(tracerManager)
    this.instrumentation = new InstrumentationManager(this.instrumentationsList)
    this.instrumentation.enable()

    this.context = new ContextManager(manualInstrumentation)
  }

  async flush() {
    await this.lifecycle.flush()
  }

  async shutdown() {
    await this.lifecycle.shutdown()
  }

  private initProviderInstrumentations(tracerManager: TracerManager) {
    type InstrumentationClass =
      | typeof AnthropicInstrumentation
      | typeof AIPlatformInstrumentation
      | typeof BedrockInstrumentation
      | typeof CohereInstrumentation
      | typeof LangChainInstrumentation
      | typeof LlamaIndexInstrumentation
      | typeof OpenAIInstrumentation
      | typeof TogetherInstrumentation
      | typeof VertexAIInstrumentation

    type ProviderInstrumentation = Exclude<Instrumentation, Instrumentation.Manual>

    const configure = (
      type: ProviderInstrumentation,
      Ctor: InstrumentationClass,
      opts?: { enrichTokens?: boolean },
    ) => {
      const providerPkg = this.options.instrumentations?.[type]
      if (!providerPkg) return

      const provider = tracerManager.provider(type)
      const inst = new Ctor(opts)
      inst.setTracerProvider(provider)
      inst.manuallyInstrument(providerPkg)
      registerInstrumentations({
        instrumentations: [inst],
        tracerProvider: provider,
      })
      this.instrumentationsList.push(inst)
    }

    configure(Instrumentation.Anthropic, AnthropicInstrumentation)
    configure(Instrumentation.AIPlatform, AIPlatformInstrumentation)
    configure(Instrumentation.Bedrock, BedrockInstrumentation)
    configure(Instrumentation.Cohere, CohereInstrumentation)
    configure(Instrumentation.Langchain, LangChainInstrumentation)
    configure(Instrumentation.LlamaIndex, LlamaIndexInstrumentation)
    configure(Instrumentation.OpenAI, OpenAIInstrumentation, { enrichTokens: true })
    configure(Instrumentation.TogetherAI, TogetherInstrumentation, { enrichTokens: false })
    configure(Instrumentation.VertexAI, VertexAIInstrumentation)
  }

  /**
   * Wrap a block of code with trace-wide context attributes.
   * Baggage entries (tags, metadata, sessionId, userId) are propagated
   * to all spans created within the callback via BaggageSpanProcessor.
   */
  async capture<T>(options: CaptureOptions, fn: (ctx: TelemetryContext) => T | Promise<T>): Promise<T> {
    const baggageEntries: Record<string, otel.BaggageEntry> = {}

    if (options.tags?.length) {
      baggageEntries[ATTRIBUTES.tags] = { value: JSON.stringify(options.tags) }
    }

    if (options.metadata) {
      baggageEntries[ATTRIBUTES.metadata] = { value: JSON.stringify(options.metadata) }
    }

    if (options.sessionId) {
      baggageEntries[ATTRIBUTES.sessionId] = { value: options.sessionId }
    }

    if (options.userId) {
      baggageEntries[ATTRIBUTES.userId] = { value: options.userId }
    }

    const captureContext = propagation.setBaggage(otel.ROOT_CONTEXT, propagation.createBaggage(baggageEntries))

    return await context.with(captureContext, async () => await fn(captureContext))
  }
}
