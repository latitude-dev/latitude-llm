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
import { ATTRIBUTES, DOCUMENT_PATH_REGEXP, SCOPE_LATITUDE } from "../constants/index.ts"
import { env } from "../env/index.ts"
import {
  type BaseInstrumentation,
  type CaptureOptions,
  type ChatSpanOptions,
  type ExternalSpanOptions,
  ManualInstrumentation,
  type ManualInstrumentationOptions,
  type PromptSpanOptions,
  type StartCompletionSpanOptions,
  type StartHttpSpanOptions,
  type StartSpanOptions,
  type StartToolSpanOptions,
} from "../instrumentations/index.ts"
import { DEFAULT_REDACT_SPAN_PROCESSOR } from "./redact.ts"

const TRACES_URL = `${env.GATEWAY_BASE_URL}/v1/traces`
const SERVICE_NAME = process.env.npm_package_name || "unknown"
const SCOPE_VERSION = process.env.npm_package_version || "unknown"

export type TelemetryContext = otel.Context
export const BACKGROUND = () => otel.ROOT_CONTEXT

class SpanFactory {
  private readonly telemetry: ManualInstrumentation

  constructor(telemetry: ManualInstrumentation) {
    this.telemetry = telemetry
  }

  span(options?: StartSpanOptions, ctx?: TelemetryContext) {
    return this.telemetry.unknown(ctx ?? context.active(), options)
  }

  tool(options: StartToolSpanOptions, ctx?: TelemetryContext) {
    return this.telemetry.tool(ctx ?? context.active(), options)
  }

  completion(options: StartCompletionSpanOptions, ctx?: TelemetryContext) {
    return this.telemetry.completion(ctx ?? context.active(), options)
  }

  embedding(options?: StartSpanOptions, ctx?: TelemetryContext) {
    return this.telemetry.embedding(ctx ?? context.active(), options)
  }

  http(options: StartHttpSpanOptions, ctx?: TelemetryContext) {
    return this.telemetry.http(ctx ?? context.active(), options)
  }

  prompt(options: PromptSpanOptions, ctx?: TelemetryContext) {
    return this.telemetry.prompt(ctx ?? context.active(), options)
  }

  chat(options: ChatSpanOptions, ctx?: TelemetryContext) {
    return this.telemetry.chat(ctx ?? context.active(), options)
  }

  external(options: ExternalSpanOptions, ctx?: TelemetryContext) {
    return this.telemetry.external(ctx ?? context.active(), options)
  }
}

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
    this.instrumentations.forEach((instrumentation) => {
      if (!instrumentation.isEnabled()) instrumentation.enable()
    })
  }

  disable() {
    this.instrumentations.forEach((instrumentation) => {
      if (instrumentation.isEnabled()) instrumentation.disable()
    })
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
    [Instrumentation.Manual]?: ManualInstrumentationOptions
  }
}

export class LatitudeTelemetry {
  private options: TelemetryOptions
  private nodeProvider: NodeTracerProvider
  private manualInstrumentation: ManualInstrumentation
  private instrumentationsList: BaseInstrumentation[]

  readonly span: SpanFactory
  readonly context: ContextManager
  readonly instrumentation: InstrumentationManager
  readonly tracer: TracerManager
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

    this.nodeProvider = new NodeTracerProvider({
      resource: new Resource({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
    })

    this.lifecycle = new LifecycleManager(this.nodeProvider, this.options.exporter)

    // Must run before the exporter span processors
    this.nodeProvider.addSpanProcessor(new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS))

    if (this.options.processors) {
      this.options.processors.forEach((processor) => {
        this.nodeProvider.addSpanProcessor(processor)
      })
    } else {
      this.nodeProvider.addSpanProcessor(DEFAULT_REDACT_SPAN_PROCESSOR())
    }

    if (this.options.disableBatch) {
      this.nodeProvider.addSpanProcessor(new SimpleSpanProcessor(this.options.exporter))
    } else {
      this.nodeProvider.addSpanProcessor(new BatchSpanProcessor(this.options.exporter))
    }

    this.nodeProvider.register()

    process.on("SIGTERM", async () => this.shutdown)
    process.on("SIGINT", async () => this.shutdown)

    this.manualInstrumentation = null as unknown as ManualInstrumentation
    this.instrumentationsList = []
    this.tracer = new TracerManager(this.nodeProvider, SCOPE_VERSION)
    this.initInstrumentations()
    this.instrumentation = new InstrumentationManager(this.instrumentationsList)
    this.instrumentation.enable()

    this.span = new SpanFactory(this.manualInstrumentation)
    this.context = new ContextManager(this.manualInstrumentation)
  }

  async flush() {
    await this.lifecycle.flush()
  }

  async shutdown() {
    await this.lifecycle.shutdown()
  }

  private initInstrumentations() {
    this.instrumentationsList = []

    const tracer = this.tracer.get(Instrumentation.Manual)
    this.manualInstrumentation = new ManualInstrumentation(tracer, this.options.instrumentations?.manual)
    this.instrumentationsList.push(this.manualInstrumentation)

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

    const configureInstrumentation = (
      instrumentationType: Instrumentation,
      InstrumentationConstructor: InstrumentationClass,
      instrumentationOptions?: { enrichTokens?: boolean },
    ) => {
      const providerPkg = this.options.instrumentations?.[instrumentationType]
      if (!providerPkg) return

      const provider = this.tracer.provider(instrumentationType)
      const instrumentation = new InstrumentationConstructor(instrumentationOptions)
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(providerPkg)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentationsList.push(instrumentation)
    }

    configureInstrumentation(Instrumentation.Anthropic, AnthropicInstrumentation)
    configureInstrumentation(Instrumentation.AIPlatform, AIPlatformInstrumentation)
    configureInstrumentation(Instrumentation.Bedrock, BedrockInstrumentation)
    configureInstrumentation(Instrumentation.Cohere, CohereInstrumentation)
    configureInstrumentation(Instrumentation.Langchain, LangChainInstrumentation)
    configureInstrumentation(Instrumentation.LlamaIndex, LlamaIndexInstrumentation)
    configureInstrumentation(Instrumentation.OpenAI, OpenAIInstrumentation, { enrichTokens: true })
    configureInstrumentation(Instrumentation.TogetherAI, TogetherInstrumentation, { enrichTokens: false })
    configureInstrumentation(Instrumentation.VertexAI, VertexAIInstrumentation)
  }

  async capture<T>(options: CaptureOptions, fn: (ctx: TelemetryContext) => T | Promise<T>): Promise<T> {
    if (!DOCUMENT_PATH_REGEXP.test(options.path)) {
      throw new Error("Invalid path, no spaces. Only letters, numbers, '.', '-' and '_'")
    }

    const captureBaggageEntries: Record<string, otel.BaggageEntry> = {
      [ATTRIBUTES.LATITUDE.promptPath]: { value: options.path },
      [ATTRIBUTES.LATITUDE.projectId]: { value: String(options.projectId) },
    }

    if (options.versionUuid) {
      captureBaggageEntries[ATTRIBUTES.LATITUDE.commitUuid] = {
        value: options.versionUuid,
      }
    }

    if (options.conversationUuid) {
      captureBaggageEntries[ATTRIBUTES.LATITUDE.documentLogUuid] = {
        value: options.conversationUuid,
      }
    }

    const captureContext = propagation.setBaggage(BACKGROUND(), propagation.createBaggage(captureBaggageEntries))

    const span = this.manualInstrumentation.unresolvedExternal(captureContext, options)

    let result: T
    try {
      result = await context.with(span.context, async () => await fn(span.context))
    } catch (error) {
      span.fail(error as Error)
      throw error
    }

    span.end()

    return result
  }
}
