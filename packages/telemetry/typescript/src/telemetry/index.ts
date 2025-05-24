import {
  ATTR_LATITUDE_EXTERNAL_ID,
  ATTR_LATITUDE_HTTP_REQUEST,
  ATTR_LATITUDE_HTTP_RESPONSE,
  ATTR_LATITUDE_SEGMENT_ID,
  ATTR_LATITUDE_SEGMENTS,
  ATTR_LATITUDE_SOURCE,
  ATTR_LATITUDE_TOOL_ARGUMENTS,
  ATTR_LATITUDE_TOOL_RESULT,
  ATTR_LATITUDE_TYPE,
  HEAD_COMMIT,
  SegmentBaggage,
  SegmentType,
  SpanSource,
  SpanType,
} from '@latitude-data/constants'
import * as tracing from '@opentelemetry/api'
import { context, propagation } from '@opentelemetry/api'
import {
  ALLOW_ALL_BAGGAGE_KEYS,
  BaggageSpanProcessor,
} from '@opentelemetry/baggage-span-processor'
import {
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core'
import { OTLPTraceExporter as HttpExporter } from '@opentelemetry/exporter-trace-otlp-http'
import {
  InstrumentationBase,
  registerInstrumentations,
} from '@opentelemetry/instrumentation'
import { Resource } from '@opentelemetry/resources'
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  RandomIdGenerator,
  SimpleSpanProcessor,
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
import {
  DocumentSegmentOptions,
  HttpSpanOptions,
  LATITUDE_TRACES_URL,
  SegmentOptions,
  SpanOptions,
  TELEMETRY_INSTRUMENTATION_NAME,
  TELEMETRY_SERVICE_NAME,
  TelemetryOptions,
  ToolSpanOptions,
} from './shared'

export * from './shared'

export class LatitudeTelemetry {
  private options: TelemetryOptions
  public tracer: NodeTracerProvider
  private generator: RandomIdGenerator
  private instrumentations: InstrumentationBase[]

  constructor(apiKey: string, options?: TelemetryOptions) {
    this.options = options || {}

    if (!this.options.exporter) {
      this.options.exporter = new HttpExporter({
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

    this.tracer = new NodeTracerProvider({
      resource: new Resource({ [ATTR_SERVICE_NAME]: TELEMETRY_SERVICE_NAME }),
    })

    // Note: important, must run before the exporter span processors
    this.tracer.addSpanProcessor(
      new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
    )

    if (this.options.disableBatch) {
      this.tracer.addSpanProcessor(
        new SimpleSpanProcessor(this.options.exporter),
      )
    } else {
      this.tracer.addSpanProcessor(
        new BatchSpanProcessor(this.options.exporter),
      )
    }

    this.tracer.register()
    process.on('SIGTERM', async () => {
      await this.tracer.forceFlush()
      await this.tracer.shutdown()
      await this.options.exporter!.forceFlush?.()
      await this.options.exporter!.shutdown?.()
      process.exit(0)
    })

    this.generator = new RandomIdGenerator()

    this.instrumentations = []
    this.initInstrumentations()
    this.instrument()
  }

  // TODO(tracing): auto instrument outgoing HTTP requests
  private initInstrumentations() {
    const instrumentations = []

    // TODO(tracing): LatitudeInstrumentation

    const openai = this.options.instrumentations?.openai
    if (openai) {
      const instrumentation = new OpenAIInstrumentation({ enrichTokens: true })
      instrumentation.manuallyInstrument(openai)
      instrumentations.push(instrumentation)
    }

    const anthropic = this.options.instrumentations?.anthropic
    if (anthropic) {
      const instrumentation = new AnthropicInstrumentation()
      instrumentation.manuallyInstrument(anthropic)
      instrumentations.push(instrumentation)
    }

    const azure = this.options.instrumentations?.azure
    if (azure) {
      const instrumentation = new AzureOpenAIInstrumentation()
      instrumentation.manuallyInstrument(azure)
      instrumentations.push(instrumentation)
    }

    const vertexai = this.options.instrumentations?.vertexai
    if (vertexai) {
      const instrumentation = new VertexAIInstrumentation()
      instrumentation.manuallyInstrument(vertexai)
      instrumentations.push(instrumentation)
    }

    const aiplatform = this.options.instrumentations?.aiplatform
    if (aiplatform) {
      const instrumentation = new AIPlatformInstrumentation()
      instrumentation.manuallyInstrument(aiplatform)
      instrumentations.push(instrumentation)
    }

    const bedrock = this.options.instrumentations?.bedrock
    if (bedrock) {
      const instrumentation = new BedrockInstrumentation()
      instrumentation.manuallyInstrument(bedrock)
      instrumentations.push(instrumentation)
    }

    const togetherai = this.options.instrumentations?.togetherai
    if (togetherai) {
      const instrumentation = new TogetherInstrumentation({
        enrichTokens: true,
      })
      instrumentation.manuallyInstrument(togetherai)
      instrumentations.push(instrumentation)
    }

    const cohere = this.options.instrumentations?.cohere
    if (cohere) {
      const instrumentation = new CohereInstrumentation()
      instrumentation.manuallyInstrument(cohere)
      instrumentations.push(instrumentation)
    }

    const langchain = this.options.instrumentations?.langchain
    if (langchain) {
      const instrumentation = new LangChainInstrumentation()
      instrumentation.manuallyInstrument(langchain)
      instrumentations.push(instrumentation)
    }

    const llamaindex = this.options.instrumentations?.llamaindex
    if (llamaindex) {
      const instrumentation = new LlamaIndexInstrumentation()
      instrumentation.manuallyInstrument(llamaindex)
      instrumentations.push(instrumentation)
    }

    instrumentations.forEach((instrumentation) =>
      instrumentation.setTracerProvider(this.tracer),
    )
    registerInstrumentations({ instrumentations })
    this.instrumentations = instrumentations as any
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

  private span<F extends (span: tracing.Span) => ReturnType<F>>(
    name: string,
    type: SpanType,
    { externalId, attributes }: SpanOptions,
    fn: F,
  ) {
    attributes = {
      ...(attributes || {}),
      ...(externalId && { [ATTR_LATITUDE_EXTERNAL_ID]: externalId }),
      [ATTR_LATITUDE_SOURCE]: SpanSource.API,
      [ATTR_LATITUDE_TYPE]: type,
    }

    const tracer = this.tracer.getTracer(TELEMETRY_INSTRUMENTATION_NAME)
    return tracer.startActiveSpan(
      name,
      { attributes },
      context.active(),
      (span) => {
        const result = fn(span)
        if (result instanceof Promise) {
          return result.then((resolved) => {
            span.end()
            return resolved
          })
        }
        span.end()
        return result
      },
    )
  }

  tool<F extends (span: tracing.Span) => ReturnType<F>>(
    { name, attributes, arguments: args, result, ...rest }: ToolSpanOptions,
    fn: F,
  ) {
    let jsonArguments = ''
    try {
      jsonArguments = JSON.stringify(args)
    } catch (error) {
      jsonArguments = JSON.stringify({})
    }

    let jsonResult = ''
    try {
      jsonResult = JSON.stringify(result)
    } catch (error) {
      jsonResult = JSON.stringify({ value: '' })
    }

    attributes = {
      ...(attributes || {}),
      [ATTR_LATITUDE_TOOL_ARGUMENTS]: jsonArguments,
      [ATTR_LATITUDE_TOOL_RESULT]: jsonResult,
    }

    return this.span(name || 'Tool', SpanType.Tool, { attributes, ...rest }, fn)
  }

  completion<F extends (span: tracing.Span) => ReturnType<F>>(
    { name, ...rest }: SpanOptions,
    fn: F,
  ) {
    return this.span(name || 'Completion', SpanType.Completion, { ...rest }, fn)
  }

  embedding<F extends (span: tracing.Span) => ReturnType<F>>(
    { name, ...rest }: SpanOptions,
    fn: F,
  ) {
    return this.span(name || 'Embedding', SpanType.Embedding, { ...rest }, fn)
  }

  retrieval<F extends (span: tracing.Span) => ReturnType<F>>(
    { name, ...rest }: SpanOptions,
    fn: F,
  ) {
    return this.span(name || 'Retrieval', SpanType.Retrieval, { ...rest }, fn)
  }

  reranking<F extends (span: tracing.Span) => ReturnType<F>>(
    { name, ...rest }: SpanOptions,
    fn: F,
  ) {
    return this.span(name || 'Reranking', SpanType.Reranking, { ...rest }, fn)
  }

  http<F extends (span: tracing.Span) => ReturnType<F>>(
    { name, attributes, request, response, ...rest }: HttpSpanOptions,
    fn: F,
  ) {
    let jsonRequest = ''
    try {
      jsonRequest = JSON.stringify(request)
    } catch (error) {
      jsonRequest = JSON.stringify({
        method: 'UNKNOWN',
        url: 'UNKNOWN',
        headers: {},
        body: {},
      })
    }

    let jsonResponse = ''
    try {
      jsonResponse = JSON.stringify(response)
    } catch (error) {
      jsonResponse = JSON.stringify({
        status: -1,
        headers: {},
        body: {},
      })
    }

    attributes = {
      ...(attributes || {}),
      [ATTR_LATITUDE_HTTP_REQUEST]: jsonRequest,
      [ATTR_LATITUDE_HTTP_RESPONSE]: jsonResponse,
    }

    return this.span(name || 'Http', SpanType.Http, { attributes, ...rest }, fn)
  }

  private segment<F extends () => ReturnType<F>>(
    type: SegmentType,
    { name, externalId, attributes, baggage }: SegmentOptions,
    fn: F,
  ) {
    const parentBaggage = Object.fromEntries(
      propagation.getActiveBaggage()?.getAllEntries() || [],
    )

    let segments: SegmentBaggage[] = []
    if (ATTR_LATITUDE_SEGMENTS in parentBaggage) {
      try {
        segments = JSON.parse(parentBaggage[ATTR_LATITUDE_SEGMENTS].value)
      } catch (error) {
        segments = []
      }
    }

    const parentId = parentBaggage[ATTR_LATITUDE_SEGMENT_ID]?.value
    const segmentId = this.generator.generateSpanId()

    segments.push({
      ...baggage,
      id: segmentId,
      ...(parentId && { parentId }),
      ...(name && { name }),
      type: type,
    } as SegmentBaggage)

    const payload = propagation.createBaggage({
      // Cascade parent baggage
      ...parentBaggage,
      // Note: this is not baggage, just a way to pass attributes down more easily
      ...(externalId && { [ATTR_LATITUDE_EXTERNAL_ID]: { value: externalId } }),
      [ATTR_LATITUDE_SOURCE]: { value: SpanSource.API },
      ...Object.fromEntries(
        Object.entries(attributes || {}).map(([key, value]) => [
          key,
          { value: String(value) },
        ]),
      ),
      // Current segment baggage
      [ATTR_LATITUDE_SEGMENT_ID]: { value: segmentId },
      [ATTR_LATITUDE_SEGMENTS]: { value: JSON.stringify(segments) },
    })

    return context.with(propagation.setBaggage(context.active(), payload), fn)
  }

  document<F extends () => ReturnType<F>>(
    {
      baggage,
      versionUuid,
      documentUuid,
      documentType,
      experimentUuid,
      promptHash,
      ...rest
    }: DocumentSegmentOptions,
    fn: F,
  ) {
    baggage = {
      ...(baggage || {}),
      versionUuid: versionUuid || HEAD_COMMIT,
      documentUuid: documentUuid,
      ...(documentType && { documentType }),
      ...(experimentUuid && { experimentUuid }),
      ...(promptHash && { promptHash }),
    }

    return this.segment(SegmentType.Document, { baggage, ...rest }, fn)
  }

  step<F extends () => ReturnType<F>>(options: SegmentOptions, fn: F) {
    return this.segment(SegmentType.Step, options, fn)
  }
}
