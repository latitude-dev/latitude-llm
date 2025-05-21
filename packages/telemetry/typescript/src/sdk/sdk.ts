import {
  BaseInstrumentation,
  DocumentSegmentOptions,
  LatitudeInstrumentation,
  LatitudeInstrumentationOptions,
  ManualInstrumentation,
  SegmentOptions,
  StartCompletionSpanOptions,
  StartHttpSpanOptions,
  StartSpanOptions,
  StartToolSpanOptions,
} from '$telemetry/instrumentations'
import {
  InstrumentationScope,
  SCOPE_LATITUDE,
  SpanSource,
} from '@latitude-data/constants'
import * as otel from '@opentelemetry/api'
import { propagation } from '@opentelemetry/api'
import {
  ALLOW_ALL_BAGGAGE_KEYS,
  BaggageSpanProcessor,
} from '@opentelemetry/baggage-span-processor'
import {
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

import type * as anthropic from '@anthropic-ai/sdk'
import type * as bedrock from '@aws-sdk/client-bedrock-runtime'
import type * as azure from '@azure/openai'
import type * as aiplatform from '@google-cloud/aiplatform'
import type * as vertexai from '@google-cloud/vertexai'
import type * as langchain_runnables from '@langchain/core/runnables'
import type * as langchain_vectorstores from '@langchain/core/vectorstores'
import type * as latitude from '@latitude-data/sdk'
import type * as cohere from 'cohere-ai'
import type * as langchain_agents from 'langchain/agents'
import type * as langchain_chains from 'langchain/chains'
import type * as langchain_tools from 'langchain/tools'
import type * as llamaindex from 'llamaindex'
import type * as openai from 'openai'
import type * as togetherai from 'together-ai'

// prettier-ignore
const LATITUDE_BASE_URL = process.env.NODE_ENV === 'production' ? 'https://gateway.latitude.so' : 'http://localhost:8787'
const LATITUDE_TRACES_URL = `${LATITUDE_BASE_URL}/api/v3/otlp/v1/traces`
const TELEMETRY_SERVICE_NAME = process.env.npm_package_name || 'unknown'
const SCOPE_VERSION = process.env.npm_package_version || 'unknown'

// TODO(tracing): fix this is not working for other instrumentations
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
    [Instrumentation.OpenAI]?: typeof openai.OpenAI
    [Instrumentation.Anthropic]?: typeof anthropic
    [Instrumentation.AzureOpenAI]?: typeof azure
    [Instrumentation.VercelAI]?: 'manual'
    [Instrumentation.VertexAI]?: typeof vertexai
    [Instrumentation.AIPlatform]?: typeof aiplatform
    [Instrumentation.Bedrock]?: typeof bedrock
    [Instrumentation.TogetherAI]?: typeof togetherai.Together
    [Instrumentation.Cohere]?: typeof cohere
    [Instrumentation.Langchain]?: {
      chainsModule: typeof langchain_chains
      agentsModule: typeof langchain_agents
      toolsModule: typeof langchain_tools
      vectorStoreModule: typeof langchain_vectorstores
      runnablesModule: typeof langchain_runnables
    }
    [Instrumentation.LlamaIndex]?: typeof llamaindex
  }
  disableBatch?: boolean
  exporter?: SpanExporter
}

export class LatitudeTelemetry {
  private options: TelemetryOptions
  private provider: NodeTracerProvider
  private telemetry: ManualInstrumentation
  private instrumentations: BaseInstrumentation[]

  constructor(apiKey: string, options?: TelemetryOptions) {
    this.options = options || {}

    if (!this.options.exporter) {
      this.options.exporter = new OTLPTraceExporter({
        url: LATITUDE_TRACES_URL,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeoutMillis: 30 * 1000,
      })
    }

    propagation.setGlobalPropagator(new W3CBaggagePropagator())
    propagation.setGlobalPropagator(new W3CTraceContextPropagator())

    this.provider = new NodeTracerProvider({
      resource: new Resource({ [ATTR_SERVICE_NAME]: TELEMETRY_SERVICE_NAME }),
    })

    // Note: important, must run before the exporter span processors
    this.provider.addSpanProcessor(
      new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
    )

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
    process.on('SIGTERM', async () => {
      await this.provider.forceFlush()
      await this.provider.shutdown()
      await this.options.exporter!.forceFlush?.()
      await this.options.exporter!.shutdown?.()
      process.exit(0)
    })

    this.telemetry = null as unknown as ManualInstrumentation
    this.instrumentations = []
    this.initInstrumentations()
    this.instrument()
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
    const instrumentations = []
    const otelInstrumentations = []

    const tracer = this.tracer(InstrumentationScope.Manual as any)
    this.telemetry = new ManualInstrumentation(SpanSource.API, tracer)
    instrumentations.push(this.telemetry)

    const latitude = this.options.instrumentations?.latitude
    if (latitude) {
      const tracer = this.tracer(Instrumentation.Latitude)
      const instrumentation = new LatitudeInstrumentation(
        SpanSource.API,
        tracer,
        typeof latitude === 'object' ? latitude : { module: latitude },
      )
      instrumentations.push(instrumentation)
    }

    const openai = this.options.instrumentations?.openai
    if (openai) {
      const provider = this.tracerProvider(Instrumentation.OpenAI)
      const instrumentation = new OpenAIInstrumentation({ enrichTokens: true })
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(openai)
      otelInstrumentations.push(instrumentation)
    }

    const anthropic = this.options.instrumentations?.anthropic
    if (anthropic) {
      const provider = this.tracerProvider(Instrumentation.Anthropic)
      const instrumentation = new AnthropicInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(anthropic)
      otelInstrumentations.push(instrumentation)
    }

    const azure = this.options.instrumentations?.azure
    if (azure) {
      const provider = this.tracerProvider(Instrumentation.AzureOpenAI)
      const instrumentation = new AzureOpenAIInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(azure)
      otelInstrumentations.push(instrumentation)
    }

    const vertexai = this.options.instrumentations?.vertexai
    if (vertexai) {
      const provider = this.tracerProvider(Instrumentation.VertexAI)
      const instrumentation = new VertexAIInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(vertexai)
      otelInstrumentations.push(instrumentation)
    }

    const aiplatform = this.options.instrumentations?.aiplatform
    if (aiplatform) {
      const provider = this.tracerProvider(Instrumentation.AIPlatform)
      const instrumentation = new AIPlatformInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(aiplatform)
      otelInstrumentations.push(instrumentation)
    }

    const bedrock = this.options.instrumentations?.bedrock
    if (bedrock) {
      const provider = this.tracerProvider(Instrumentation.Bedrock)
      const instrumentation = new BedrockInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(bedrock)
      otelInstrumentations.push(instrumentation)
    }

    const togetherai = this.options.instrumentations?.togetherai
    if (togetherai) {
      const provider = this.tracerProvider(Instrumentation.TogetherAI)
      const instrumentation = new TogetherInstrumentation({
        enrichTokens: true,
      })
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(togetherai)
      otelInstrumentations.push(instrumentation)
    }

    const cohere = this.options.instrumentations?.cohere
    if (cohere) {
      const provider = this.tracerProvider(Instrumentation.Cohere)
      const instrumentation = new CohereInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(cohere)
      otelInstrumentations.push(instrumentation)
    }

    const langchain = this.options.instrumentations?.langchain
    if (langchain) {
      const provider = this.tracerProvider(Instrumentation.Langchain)
      const instrumentation = new LangChainInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(langchain)
      otelInstrumentations.push(instrumentation)
    }

    const llamaindex = this.options.instrumentations?.llamaindex
    if (llamaindex) {
      const provider = this.tracerProvider(Instrumentation.LlamaIndex)
      const instrumentation = new LlamaIndexInstrumentation()
      instrumentation.setTracerProvider(provider)
      instrumentation.manuallyInstrument(llamaindex)
      otelInstrumentations.push(instrumentation)
    }

    this.instrumentations = [...instrumentations, ...otelInstrumentations]
    registerInstrumentations({ instrumentations: otelInstrumentations })
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

  document<F extends () => ReturnType<F>>(
    options: DocumentSegmentOptions,
    fn: F,
  ) {
    return this.telemetry.document(options, fn)
  }

  step<F extends () => ReturnType<F>>(options: SegmentOptions, fn: F) {
    return this.telemetry.step(options, fn)
  }
}
