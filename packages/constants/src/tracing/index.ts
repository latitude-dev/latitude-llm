import { z } from 'zod'

export * from './span'
export * from './trace'

/* Note: Instrumentation scopes from all language SDKs */

export const SCOPE_LATITUDE = 'so.latitude.instrumentation'

export enum InstrumentationScope {
  Manual = 'manual',
  Latitude = 'latitude',
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  AzureOpenAI = 'azure', // Only python — js uses OpenAI instrumentation
  VercelAI = 'vercelai',
  VertexAI = 'vertexai',
  AIPlatform = 'aiplatform',
  MistralAI = 'mistralai', // Only python
  Bedrock = 'bedrock',
  Sagemaker = 'sagemaker', // Only python
  TogetherAI = 'togetherai',
  Replicate = 'replicate', // Only python
  Groq = 'groq', // Only python
  Cohere = 'cohere',
  LiteLLM = 'litellm', // Only python
  Langchain = 'langchain',
  LlamaIndex = 'llamaindex',
  DSPy = 'dspy', // Only python
  Haystack = 'haystack', // Only python
  Ollama = 'ollama', // Only python
  Transformers = 'transformers', // Only python
  AlephAlpha = 'alephalpha', // Only python
}

/* Note: Schemas for span ingestion following OpenTelemetry service request specification */

export namespace Otlp {
  export const attributeValueSchema = z.object({
    stringValue: z.string().optional(),
    intValue: z.number().optional(),
    boolValue: z.boolean().optional(),
    arrayValue: z
      .object({
        values: z.array(
          z.object({
            stringValue: z.string().optional(),
            intValue: z.number().optional(),
            boolValue: z.boolean().optional(),
          }),
        ),
      })
      .optional(),
  })
  export type AttributeValue = z.infer<typeof attributeValueSchema>

  export const attributeSchema = z.object({
    key: z.string(),
    value: attributeValueSchema,
  })
  export type Attribute = z.infer<typeof attributeSchema>

  export const eventSchema = z.object({
    name: z.string(),
    timeUnixNano: z.string(),
    attributes: z.array(attributeSchema).optional(),
  })
  export type Event = z.infer<typeof eventSchema>

  export const linkSchema = z.object({
    traceId: z.string(),
    spanId: z.string(),
    attributes: z.array(attributeSchema).optional(),
  })
  export type Link = z.infer<typeof linkSchema>

  export enum StatusCode {
    Unset = 0,
    Ok = 1,
    Error = 2,
  }

  export const statusSchema = z.object({
    code: z.number(),
    message: z.string().optional(),
  })
  export type Status = z.infer<typeof statusSchema>

  export enum SpanKind {
    Internal = 0,
    Server = 1,
    Client = 2,
    Producer = 3,
    Consumer = 4,
  }

  export const spanSchema = z.object({
    traceId: z.string(),
    spanId: z.string(),
    parentSpanId: z.string().optional(),
    name: z.string(),
    kind: z.number(),
    startTimeUnixNano: z.string(),
    endTimeUnixNano: z.string(),
    status: statusSchema.optional(),
    events: z.array(eventSchema).optional(),
    links: z.array(linkSchema).optional(),
    attributes: z.array(attributeSchema).optional(),
  })
  export type Span = z.infer<typeof spanSchema>

  export const scopeSchema = z.object({
    name: z.string(),
    version: z.string().optional(),
  })
  export type Scope = z.infer<typeof scopeSchema>

  export const scopeSpanSchema = z.object({
    scope: scopeSchema,
    spans: z.array(spanSchema),
  })
  export type ScopeSpan = z.infer<typeof scopeSpanSchema>

  export const resourceSchema = z.object({
    attributes: z.array(attributeSchema),
  })
  export type Resource = z.infer<typeof resourceSchema>

  export const resourceSpanSchema = z.object({
    resource: resourceSchema,
    scopeSpans: z.array(scopeSpanSchema),
  })
  export type ResourceSpan = z.infer<typeof resourceSpanSchema>

  export const serviceRequestSchema = z.object({
    resourceSpans: z.array(resourceSpanSchema),
  })
  export type ServiceRequest = z.infer<typeof serviceRequestSchema>
}

export type SpanIngestionData = {
  ingestionId: string
  spans: Otlp.ResourceSpan[]
}

// prettier-ignore
export const SPAN_INGESTION_STORAGE_KEY = (
  ingestionId: string, // Note: using single id to avoid dangling folders
) => encodeURI(`ingest/traces/${ingestionId}`)

export type SpanProcessingData = {
  span: Otlp.Span
  scope: Otlp.Scope
  resource: Otlp.Resource
}

// prettier-ignore
export const SPAN_PROCESSING_STORAGE_KEY = (
  processingId: string, // Note: using single id to avoid dangling folders
) => encodeURI(`process/traces/${processingId}`)

export const TRACING_JOBS_MAX_ATTEMPTS = 3
export const TRACING_JOBS_DELAY_BETWEEN_CONFLICTS = () =>
  (Math.floor(Math.random() * 10) + 1) * 1000 // 1-10 random seconds in order to serialize conflicts (best effort)

export { ATTRIBUTES, VALUES } from './attributes'
