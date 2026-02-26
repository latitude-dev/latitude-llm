import { env } from '$telemetry/env'
import {
  BaseInstrumentation,
  CaptureOptions,
  ChatSpanOptions,
  ExternalSpanOptions,
  LatitudeInstrumentation,
  LatitudeInstrumentationOptions,
  ManualInstrumentation,
  ManualInstrumentationOptions,
  PromptSpanOptions,
  StartCompletionSpanOptions,
  StartHttpSpanOptions,
  StartSpanOptions,
  StartToolSpanOptions,
} from '$telemetry/instrumentations'
import { DEFAULT_REDACT_SPAN_PROCESSOR } from '$telemetry/sdk/redact'
import {
  ATTRIBUTES,
  DOCUMENT_PATH_REGEXP,
  InstrumentationScope,
  SCOPE_LATITUDE,
  TraceContext,
} from '@latitude-data/constants'
import { BadRequestError } from '@latitude-data/constants/errors'
import type * as latitude from '@latitude-data/sdk'
import * as otel from '@opentelemetry/api'
import { context, propagation, TextMapPropagator } from '@opentelemetry/api'
import {
  ALLOW_ALL_BAGGAGE_KEYS,
  BaggageSpanProcessor,
} from '@opentelemetry/baggage-span-processor'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { Resource } from '@opentelemetry/resources'
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  SimpleSpanProcessor,
  SpanExporter,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { AnthropicInstrumentation } from '@traceloop/instrumentation-anthropic'
import { BedrockInstrumentation } from '@traceloop/instrumentation-bedrock'
import { CohereInstrumentation } from '@traceloop/instrumentation-cohere'
import { LangChainInstrumentation } from '@traceloop/instrumentation-langchain'
import { LlamaIndexInstrumentation } from '@traceloop/instrumentation-llamaindex'
import { OpenAIInstrumentation } from '@traceloop/instrumentation-openai'
import { TogetherInstrumentation } from '@traceloop/instrumentation-together'
import {
  AIPlatformInstrumentation,
  VertexAIInstrumentation,
} from '@traceloop/instrumentation-vertexai'

const TRACES_URL = `${env.GATEWAY_BASE_URL}/api/v3/traces`
const SERVICE_NAME = process.env.npm_package_name || 'unknown'
const SCOPE_VERSION = process.env.npm_package_version || 'unknown'

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

  resume(ctx: TraceContext) {
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
    return this.provider(scope).getTracer('')
  }

  provider(scope: Instrumentation) {
    return new ScopedTracerProvider(
      `${SCOPE_LATITUDE}.${scope}`,
      this.scopeVersion,
      this.nodeProvider,
    )
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

export const DEFAULT_SPAN_EXPORTER = (apiKey: string) =>
  new OTLPTraceExporter({
    url: TRACES_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeoutMillis: 30 * 1000,
  })

// Note: Only exporting typescript instrumentations
export enum Instrumentation {
  Anthropic = InstrumentationScope.Anthropic,
  AIPlatform = InstrumentationScope.AIPlatform,
  Bedrock = InstrumentationScope.Bedrock,
  Cohere = InstrumentationScope.Cohere,
  Langchain = InstrumentationScope.Langchain,
  Latitude = InstrumentationScope.Latitude,
  LlamaIndex = InstrumentationScope.LlamaIndex,
  Manual = InstrumentationScope.Manual,
  OpenAI = InstrumentationScope.OpenAI,
  TogetherAI = InstrumentationScope.TogetherAI,
  VertexAI = InstrumentationScope.VertexAI,
}

export type TelemetryOptions = {
  disableBatch?: boolean
  exporter?: SpanExporter
  processors?: SpanProcessor[]
  propagators?: TextMapPropagator[]
  instrumentations?: {
    [Instrumentation.Latitude]?:
      | typeof latitude.Latitude
      | LatitudeInstrumentationOptions

    // Note: These are all typed as 'any' because using the actual expected types will cause
    // type errors when the version installed in the package is even slightly different than
    // the version used in the project.
    [Instrumentation.AIPlatform]?: any
    [Instrumentation.Anthropic]?: any
    [Instrumentation.Bedrock]?: any
    [Instrumentation.Cohere]?: any
    [Instrumentation.OpenAI]?: any
    [Instrumentation.LlamaIndex]?: any
    [Instrumentation.TogetherAI]?: any
    [Instrumentation.VertexAI]?: any
    [Instrumentation.Langchain]?: {
      callbackManagerModule?: any
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

  constructor(apiKey: string, options?: TelemetryOptions) {
    this.options = options || {}

    if (!this.options.exporter) {
      this.options.exporter = DEFAULT_SPAN_EXPORTER(apiKey)
    }

    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    )

    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [
          ...(this.options.propagators || []),
          new W3CTraceContextPropagator(),
          new W3CBaggagePropagator(),
        ],
      }),
    )

    this.nodeProvider = new NodeTracerProvider({
      resource: new Resource({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
    })

    this.lifecycle = new LifecycleManager(
      this.nodeProvider,
      this.options.exporter,
    )

    // Note: important, must run before the exporter span processors
    this.nodeProvider.addSpanProcessor(
      new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
    )

    if (this.options.processors) {
      this.options.processors.forEach((processor) => {
        this.nodeProvider.addSpanProcessor(processor)
      })
    } else {
      this.nodeProvider.addSpanProcessor(DEFAULT_REDACT_SPAN_PROCESSOR())
    }

    if (this.options.disableBatch) {
      this.nodeProvider.addSpanProcessor(
        new SimpleSpanProcessor(this.options.exporter),
      )
    } else {
      this.nodeProvider.addSpanProcessor(
        new BatchSpanProcessor(this.options.exporter),
      )
    }

    this.nodeProvider.register()

    process.on('SIGTERM', async () => this.shutdown)
    process.on('SIGINT', async () => this.shutdown)

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

  // TODO(tracing): auto instrument outgoing HTTP requests
  private initInstrumentations() {
    this.instrumentationsList = []

    const tracer = this.tracer.get(Instrumentation.Manual)
    this.manualInstrumentation = new ManualInstrumentation(
      tracer,
      this.options.instrumentations?.manual,
    )
    this.instrumentationsList.push(this.manualInstrumentation)

    const latitude = this.options.instrumentations?.latitude
    if (latitude) {
      const tracer = this.tracer.get(Instrumentation.Latitude)
      const instrumentation = new LatitudeInstrumentation(
        tracer,
        typeof latitude === 'object' ? latitude : { module: latitude },
      )
      this.instrumentationsList.push(instrumentation)
    }

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
      const instrumentation = new InstrumentationConstructor(instrumentationOptions) // prettier-ignore
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(providerPkg)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentationsList.push(instrumentation)
    }

    configureInstrumentation(Instrumentation.Anthropic, AnthropicInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.AIPlatform, AIPlatformInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.Bedrock, BedrockInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.Cohere, CohereInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.Langchain, LangChainInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.LlamaIndex, LlamaIndexInstrumentation) // prettier-ignore
    // NOTE: `stream: true` in OpenAI make enrichTokens fail, so disabling.
    configureInstrumentation(Instrumentation.OpenAI, OpenAIInstrumentation, { enrichTokens: false }) // prettier-ignore
    configureInstrumentation(Instrumentation.TogetherAI, TogetherInstrumentation, { enrichTokens: false }) // prettier-ignore
    configureInstrumentation(Instrumentation.VertexAI, VertexAIInstrumentation) // prettier-ignore
  }

  async capture<T>(
    options: CaptureOptions,
    fn: (ctx: TelemetryContext) => T | Promise<T>,
  ): Promise<T> {
    if (!DOCUMENT_PATH_REGEXP.test(options.path)) {
      throw new BadRequestError(
        "Invalid path, no spaces. Only letters, numbers, '.', '-' and '_'",
      )
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

    const captureContext = propagation.setBaggage(
      BACKGROUND(),
      propagation.createBaggage(captureBaggageEntries),
    )

    const span = this.manualInstrumentation.unresolvedExternal(
      captureContext,
      options,
    )

    let result
    try {
      result = await context.with(
        span.context,
        async () => await fn(span.context),
      )
    } catch (error) {
      span.fail(error as Error)
      throw error
    }

    span.end()

    return result
  }
}
