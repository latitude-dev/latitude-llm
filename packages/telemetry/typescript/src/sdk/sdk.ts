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
import { NormalizingSpanProcessor } from '$telemetry/processors'
import { DEFAULT_REDACT_SPAN_PROCESSOR } from '$telemetry/sdk/redact'
import {
  ATTR_LATITUDE_PROMPT_PATH,
  HEAD_COMMIT,
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

import type * as anthropic from '@anthropic-ai/sdk'
import type * as bedrock from '@aws-sdk/client-bedrock-runtime'
import type * as azure from '@azure/openai'
import type * as vertexai from '@google-cloud/vertexai'
import type * as langchain_runnables from '@langchain/core/runnables'
import type * as langchain_vectorstores from '@langchain/core/vectorstores'
import type * as latitude from '@latitude-data/sdk'
import type * as cohere from 'cohere-ai'
import type * as langchain_agents from 'langchain/agents'
import type * as langchain_chains from 'langchain/chains'
import type * as langchain_tools from 'langchain/tools'
import type * as openai from 'openai'
import type * as togetherai from 'together-ai'

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
    [Instrumentation.OpenAI]?: typeof openai.OpenAI
    [Instrumentation.Anthropic]?: typeof anthropic
    [Instrumentation.AzureOpenAI]?: typeof azure
    [Instrumentation.VercelAI]?: 'manual'
    [Instrumentation.VertexAI]?: typeof vertexai
    [Instrumentation.AIPlatform]?: any // Note: Any because this type is huge
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
    [Instrumentation.LlamaIndex]?: any // Note: Any because this type is huge
  }
  disableBatch?: boolean
  exporter?: SpanExporter
  processors?: SpanProcessor[]
  propagators?: TextMapPropagator[]
  /** Enable debug logging to see all spans being created */
  debug?: boolean
}

/**
 * Options for the trace() method that wraps user code in a scoped context.
 * All child spans created within the trace callback will inherit these metadata
 * via OpenTelemetry baggage propagation.
 */
export type TraceOptions = {
  /** Optional name for the trace span */
  name?: string
  /** Project ID for the trace */
  projectId?: number | string
  /** Version UUID (commit UUID) for the trace */
  versionUuid?: string
  /** Path-based prompt identification (resolved server-side to documentUuid) */
  promptPath?: string
  /** UUID-based prompt identification */
  promptUuid?: string
  /** External identifier for correlation */
  externalId?: string
  /** Additional custom metadata */
  metadata?: Record<string, unknown>
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

    // Normalize Vercel AI SDK spans to standard GenAI semantic conventions
    this.provider.addSpanProcessor(new NormalizingSpanProcessor())

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

  /**
   * Wraps a function execution in a trace scope.
   * All OpenTelemetry spans created within the callback will be children
   * of this trace and inherit the metadata via baggage propagation.
   *
   * @example
   * ```typescript
   * const result = await telemetry.trace({
   *   projectId: 123,
   *   versionUuid: 'abc-123',
   *   promptPath: 'chat/greeting',
   * }, async () => {
   *   // All spans created here (e.g., OpenAI calls) will be children of this trace
   *   return openai.chat.completions.create({ ... })
   * })
   * ```
   */
  async trace<T>(options: TraceOptions, fn: () => Promise<T>): Promise<T> {
    const {
      name,
      projectId,
      versionUuid,
      promptPath,
      promptUuid,
      externalId,
      metadata,
    } = options

    // Create parent "prompt" span with latitude.* attributes
    const span = this.telemetry.prompt(context.active(), {
      name,
      projectId: projectId?.toString(),
      versionUuid: versionUuid || HEAD_COMMIT,
      promptUuid,
      promptPath,
      externalId,
      attributes: metadata as otel.Attributes,
    })

    // Set baggage for metadata propagation to child spans
    // The BaggageSpanProcessor will copy these to span attributes
    let ctx = span.context
    const baggageEntries: Record<string, { value: string }> = {}

    if (projectId) {
      baggageEntries['latitude.projectId'] = { value: String(projectId) }
    }
    if (versionUuid) {
      baggageEntries['latitude.commitUuid'] = { value: versionUuid }
    } else {
      baggageEntries['latitude.commitUuid'] = { value: HEAD_COMMIT }
    }
    if (promptUuid) {
      baggageEntries['latitude.documentUuid'] = { value: promptUuid }
    }
    if (promptPath) {
      baggageEntries[ATTR_LATITUDE_PROMPT_PATH] = { value: promptPath }
    }
    if (externalId) {
      baggageEntries['latitude.externalId'] = { value: externalId }
    }

    const baggage = propagation.createBaggage(baggageEntries)
    ctx = propagation.setBaggage(ctx, baggage)

    try {
      // Execute the function within this context
      // All child spans will be parented to our span and inherit baggage
      const result = await context.with(ctx, fn)
      span.end()
      return result
    } catch (error) {
      span.fail(error as Error)
      throw error
    }
  }

  /**
   * Creates a higher-order function wrapper for tracing.
   * Returns a new function that, when called, automatically traces its execution
   * with the provided options.
   *
   * @example
   * ```typescript
   * const tracedGenerate = telemetry.wrap(generateAIResponse, {
   *   projectId: 123,
   *   versionUuid: 'abc-123',
   *   promptPath: 'chat/greeting',
   * })
   *
   * // Later, each call is automatically traced:
   * const result = await tracedGenerate(prompt, options)
   * ```
   */
  wrap<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: TraceOptions,
  ): (...args: TArgs) => Promise<TResult> {
    return (...args: TArgs) => this.trace(options, () => fn(...args))
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
