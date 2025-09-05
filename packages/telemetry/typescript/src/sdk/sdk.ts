import { env } from '$telemetry/env'
import {
  BaseInstrumentation,
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
import { AzureOpenAIInstrumentation } from '@traceloop/instrumentation-azure'
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

import type * as langchain_runnables from '@langchain/core/runnables'
import type * as langchain_vectorstores from '@langchain/core/vectorstores'
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
  Latitude = InstrumentationScope.Latitude,
  OpenAI = InstrumentationScope.OpenAI,
  Anthropic = InstrumentationScope.Anthropic,
  AzureOpenAI = InstrumentationScope.AzureOpenAI,
  VercelAI = InstrumentationScope.VercelAI,
  VertexAI = InstrumentationScope.VertexAI,
  AIPlatform = InstrumentationScope.AIPlatform,
  Bedrock = InstrumentationScope.Bedrock,
  TogetherAI = InstrumentationScope.TogetherAI,
  Cohere = InstrumentationScope.Cohere,
  Langchain = InstrumentationScope.Langchain,
  LlamaIndex = InstrumentationScope.LlamaIndex,
}

export type TelemetryOptions = {
  instrumentations?: {
    [Instrumentation.Latitude]?:
      | typeof latitude.Latitude
      | LatitudeInstrumentationOptions
    [Instrumentation.OpenAI]?: typeof import('openai').OpenAI
    [Instrumentation.Anthropic]?: import('@anthropic-ai/sdk').Anthropic
    [Instrumentation.AzureOpenAI]?: typeof import('@azure/openai')
    [Instrumentation.VercelAI]?: 'manual'
    [Instrumentation.VertexAI]?: import('@google-cloud/vertexai').VertexAI
    [Instrumentation.AIPlatform]?: import('@google-cloud/aiplatform').v1.EndpointServiceClient
    [Instrumentation.Bedrock]?: import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient
    [Instrumentation.TogetherAI]?: import('together-ai').default
    [Instrumentation.Cohere]?: typeof import('cohere-ai').CohereClientV2
    [Instrumentation.Langchain]?: {
      chainsModule: import('langchain/chains').APIChain
      agentsModule: import('langchain/agents').AgentExecutor
      toolsModule: import('langchain/tools').Tool
      vectorStoreModule: typeof langchain_vectorstores
      runnablesModule: typeof langchain_runnables
    }
    [Instrumentation.LlamaIndex]?: import('llamaindex').OpenAI
  }
  disableBatch?: boolean
  exporter?: SpanExporter
  processors?: SpanProcessor[]
  propagators?: TextMapPropagator[]
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

    const openai = this.options.instrumentations?.openai
    if (openai) {
      const provider = this.tracerProvider(Instrumentation.OpenAI)
      const instrumentation = new OpenAIInstrumentation({ enrichTokens: true })
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(openai)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }

    const anthropic = this.options.instrumentations?.anthropic
    if (anthropic) {
      const provider = this.tracerProvider(Instrumentation.Anthropic)
      const instrumentation = new AnthropicInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(anthropic)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }

    const azure = this.options.instrumentations?.azure
    if (azure) {
      const provider = this.tracerProvider(Instrumentation.AzureOpenAI)
      const instrumentation = new AzureOpenAIInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(azure)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }

    const vertexai = this.options.instrumentations?.vertexai
    if (vertexai) {
      const provider = this.tracerProvider(Instrumentation.VertexAI)
      const instrumentation = new VertexAIInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(vertexai)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }

    const aiplatform = this.options.instrumentations?.aiplatform
    if (aiplatform) {
      const provider = this.tracerProvider(Instrumentation.AIPlatform)
      const instrumentation = new AIPlatformInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(aiplatform)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }

    const bedrock = this.options.instrumentations?.bedrock
    if (bedrock) {
      const provider = this.tracerProvider(Instrumentation.Bedrock)
      const instrumentation = new BedrockInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(bedrock)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }

    const togetherai = this.options.instrumentations?.togetherai
    if (togetherai) {
      const provider = this.tracerProvider(Instrumentation.TogetherAI)
      const instrumentation = new TogetherInstrumentation({
        enrichTokens: true,
      })
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(togetherai)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }

    const cohere = this.options.instrumentations?.cohere
    if (cohere) {
      const provider = this.tracerProvider(Instrumentation.Cohere)
      const instrumentation = new CohereInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(cohere)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }

    const langchain = this.options.instrumentations?.langchain
    if (langchain) {
      const provider = this.tracerProvider(Instrumentation.Langchain)
      const instrumentation = new LangChainInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(langchain)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }

    const llamaindex = this.options.instrumentations?.llamaindex
    if (llamaindex) {
      const provider = this.tracerProvider(Instrumentation.LlamaIndex)
      const instrumentation = new LlamaIndexInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(llamaindex)
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: provider,
      })
      this.instrumentations.push(instrumentation)
    }
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
}

export type {
  EndCompletionSpanOptions,
  EndHttpSpanOptions,
  EndSpanOptions,
  EndToolSpanOptions,
  ErrorOptions,
  PromptSpanOptions as PromptSegmentOptions,
  StartCompletionSpanOptions,
  StartHttpSpanOptions,
  StartSpanOptions,
  StartToolSpanOptions,
} from '$telemetry/instrumentations'
