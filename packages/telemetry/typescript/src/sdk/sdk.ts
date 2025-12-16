import { env } from '$telemetry/env'
import {
  BaseInstrumentation,
  ChatSpanOptions,
  ExternalSpanOptions,
  LatitudeInstrumentation,
  LatitudeInstrumentationOptions,
  ManualInstrumentation,
  PromptSpanOptions,
  StartCompletionSpanOptions,
  StartHttpSpanOptions,
  StartSpanOptions,
  StartToolSpanOptions,
} from '$telemetry/instrumentations'
import { DEFAULT_REDACT_SPAN_PROCESSOR } from '$telemetry/sdk/redact'
import {
  InstrumentationScope,
  SCOPE_LATITUDE,
  TraceContext,
} from '@latitude-data/constants'
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
import type * as latitude from '@latitude-data/sdk'

const TRACES_URL = `${env.GATEWAY_BASE_URL}/api/v3/traces`
const SERVICE_NAME = process.env.npm_package_name || 'unknown'
const SCOPE_VERSION = process.env.npm_package_version || 'unknown'

export type TelemetryContext = otel.Context
export const BACKGROUND = () => otel.ROOT_CONTEXT

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
  }
}

export class LatitudeTelemetry {
  private options: TelemetryOptions
  private provider: NodeTracerProvider
  private telemetry: ManualInstrumentation
  private instrumentations: BaseInstrumentation[]

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

    this.provider = new NodeTracerProvider({
      resource: new Resource({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
    })

    // Note: important, must run before the exporter span processors
    this.provider.addSpanProcessor(
      new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
    )

    if (this.options.processors) {
      this.options.processors.forEach((processor) => {
        this.provider.addSpanProcessor(processor)
      })
    } else {
      this.provider.addSpanProcessor(DEFAULT_REDACT_SPAN_PROCESSOR())
    }

    if (this.options.disableBatch) {
      this.provider.addSpanProcessor(
        new SimpleSpanProcessor(this.options.exporter),
      )
    } else {
      this.provider.addSpanProcessor(
        new BatchSpanProcessor(this.options.exporter),
      )
    }

    this.provider.register()

    process.on('SIGTERM', async () => this.shutdown)
    process.on('SIGINT', async () => this.shutdown)

    this.telemetry = null as unknown as ManualInstrumentation
    this.instrumentations = []
    this.initInstrumentations()
    this.instrument()
  }

  async flush() {
    await this.provider.forceFlush()
    await this.options.exporter!.forceFlush?.()
  }

  async shutdown() {
    await this.flush()
    await this.provider.shutdown()
    await this.options.exporter!.shutdown?.()
  }

  tracerProvider(instrumentation: Instrumentation) {
    return new ScopedTracerProvider(
      `${SCOPE_LATITUDE}.${instrumentation}`,
      SCOPE_VERSION,
      this.provider,
    )
  }

  tracer(instrumentation: Instrumentation) {
    return this.tracerProvider(instrumentation).getTracer('')
  }

  // TODO(tracing): auto instrument outgoing HTTP requests
  private initInstrumentations() {
    this.instrumentations = []

    const tracer = this.tracer(InstrumentationScope.Manual as any)
    this.telemetry = new ManualInstrumentation(tracer)
    this.instrumentations.push(this.telemetry)

    const latitude = this.options.instrumentations?.latitude
    if (latitude) {
      const tracer = this.tracer(Instrumentation.Latitude)
      const instrumentation = new LatitudeInstrumentation(
        tracer,
        typeof latitude === 'object' ? latitude : { module: latitude },
      )
      this.instrumentations.push(instrumentation)
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
      const provider = this.tracerProvider(instrumentationType)
      const instrumentation = new InstrumentationConstructor(instrumentationOptions) // prettier-ignore
      instrumentation.setTracerProvider(provider)
      if (providerPkg) {
        instrumentation.manuallyInstrument(providerPkg)
      }
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }

    configureInstrumentation(Instrumentation.Anthropic, AnthropicInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.AIPlatform, AIPlatformInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.Bedrock, BedrockInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.Cohere, CohereInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.Langchain, LangChainInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.LlamaIndex, LlamaIndexInstrumentation) // prettier-ignore
    configureInstrumentation(Instrumentation.OpenAI, OpenAIInstrumentation, { enrichTokens: true }) // prettier-ignore
    configureInstrumentation(Instrumentation.TogetherAI, TogetherInstrumentation, { enrichTokens: true }) // prettier-ignore
    configureInstrumentation(Instrumentation.VertexAI, VertexAIInstrumentation) // prettier-ignore
  }

  instrument() {
    this.instrumentations.forEach((instrumentation) => {
      if (!instrumentation.isEnabled()) instrumentation.enable()
    })
  }

  uninstrument() {
    this.instrumentations.forEach((instrumentation) => {
      if (instrumentation.isEnabled()) instrumentation.disable()
    })
  }

  resume(ctx: TraceContext) {
    return this.telemetry.resume(ctx)
  }

  tool(ctx: otel.Context, options: StartToolSpanOptions) {
    return this.telemetry.tool(ctx, options)
  }

  completion(ctx: otel.Context, options: StartCompletionSpanOptions) {
    return this.telemetry.completion(ctx, options)
  }

  embedding(ctx: otel.Context, options?: StartSpanOptions) {
    return this.telemetry.embedding(ctx, options)
  }

  retrieval(ctx: otel.Context, options?: StartSpanOptions) {
    return this.telemetry.retrieval(ctx, options)
  }

  reranking(ctx: otel.Context, options?: StartSpanOptions) {
    return this.telemetry.reranking(ctx, options)
  }

  http(ctx: otel.Context, options: StartHttpSpanOptions) {
    return this.telemetry.http(ctx, options)
  }

  prompt(ctx: otel.Context, options: PromptSpanOptions) {
    return this.telemetry.prompt(ctx, options)
  }

  step(ctx: otel.Context, options?: StartSpanOptions) {
    return this.telemetry.step(ctx, options)
  }

  chat(ctx: otel.Context, options: ChatSpanOptions) {
    return this.telemetry.chat(ctx, options)
  }

  external(ctx: otel.Context, options: ExternalSpanOptions) {
    return this.telemetry.external(ctx, options)
  }
}

export type {
  ChatSpanOptions,
  EndCompletionSpanOptions,
  EndHttpSpanOptions,
  EndSpanOptions,
  EndToolSpanOptions,
  ErrorOptions,
  ExternalSpanOptions,
  PromptSpanOptions as PromptSegmentOptions,
  StartCompletionSpanOptions,
  StartHttpSpanOptions,
  StartSpanOptions,
  StartToolSpanOptions,
} from '$telemetry/instrumentations'
