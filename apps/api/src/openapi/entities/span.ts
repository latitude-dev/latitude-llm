import type { Span, SpanDetail } from "@domain/spans"
import { z } from "@hono/zod-openapi"

const nullableString = () => z.string().nullable()
const emptyToNull = (value: string): string | null => (value === "" ? null : value)

const SPAN_KINDS = ["unspecified", "internal", "server", "client", "producer", "consumer"] as const
const SPAN_STATUS_CODES = ["unset", "ok", "error"] as const

// Fields returned in span LIST shapes (`Span`). Keeps every identifier, the
// timing/status envelope, and the GenAI enrichment that drives the spans-tab
// timeline. Heavier OpenTelemetry payloads (attributes, resource, raw events
// and links JSON) and the LLM conversation content live on `SpanDetail`.
const spanListFields = {
  organizationId: z.string().describe("Organization that owns this span."),
  projectId: z.string().describe("Project this span belongs to."),
  traceId: z.string().describe("Identifier of the trace this span belongs to."),
  spanId: z.string().describe("Stable span identifier within the trace."),
  parentSpanId: nullableString().describe("Identifier of the parent span. `null` for root spans."),
  sessionId: nullableString().describe("Conversation/session identifier set by the SDK. `null` when absent."),
  userId: nullableString().describe("End-user identifier set by the SDK. `null` when absent."),
  simulationId: nullableString().describe(
    "CUID of the simulation that produced this span. `null` when not a simulation.",
  ),
  apiKeyId: nullableString().describe(
    "Latitude API key used to ingest the span. `null` when ingested without an API key.",
  ),
  startTime: z.string().describe("ISO-8601 timestamp at which the span started."),
  endTime: z.string().describe("ISO-8601 timestamp at which the span ended."),
  name: z.string().describe("Span name (e.g. the entry-point function or route)."),
  serviceName: z.string().describe("OpenTelemetry `service.name` of the emitting service."),
  kind: z.enum(SPAN_KINDS).describe("OpenTelemetry span kind."),
  statusCode: z.enum(SPAN_STATUS_CODES).describe("OpenTelemetry span status code."),
  statusMessage: z.string().describe("OpenTelemetry status message. Empty when not set."),
  traceFlags: z.number().describe("OpenTelemetry trace flags bitfield."),
  traceState: z.string().describe("OpenTelemetry trace state (vendor-specific propagation). Empty when not set."),
  errorType: nullableString().describe("Error class/type label when the span errored. `null` for successful spans."),
  tags: z.array(z.string()).describe("Free-form tags attached at ingest time."),
  operation: z
    .string()
    .describe(
      'GenAI operation category (e.g. `"chat"`, `"embeddings"`, `"execute_tool"`, `"invoke_agent"`) or a custom string for non-GenAI spans.',
    ),
  provider: nullableString().describe("LLM provider id. `null` for non-LLM spans."),
  model: nullableString().describe("Model id as requested. `null` for non-LLM spans."),
  responseModel: nullableString().describe("Model id reported by the provider's response. `null` for non-LLM spans."),
  tokensInput: z.number().describe("Input tokens consumed by this span."),
  tokensOutput: z.number().describe("Output tokens produced by this span."),
  tokensCacheRead: z.number().describe("Tokens served from the provider's prompt cache."),
  tokensCacheCreate: z.number().describe("Tokens written to the provider's prompt cache."),
  tokensReasoning: z.number().describe("Reasoning tokens reported by the model."),
  costInputMicrocents: z.number().describe("Cost of input tokens in microcents (1/1,000,000 USD)."),
  costOutputMicrocents: z.number().describe("Cost of output tokens in microcents (1/1,000,000 USD)."),
  costTotalMicrocents: z.number().describe("Total cost in microcents (1/1,000,000 USD)."),
  costIsEstimated: z
    .boolean()
    .describe("`true` when the cost was derived from public pricing tables instead of the provider's bill."),
  timeToFirstTokenNs: z
    .number()
    .describe("Nanoseconds from the start of the span to its first emitted token. `0` if not measured."),
  isStreaming: z.boolean().describe("`true` when the span was produced by a streaming LLM call."),
  responseId: nullableString().describe(
    "Response identifier returned by the LLM. `null` when the provider didn't return one.",
  ),
  finishReasons: z.array(z.string()).describe("Per-choice finish reasons reported by the LLM provider."),
  scopeName: z.string().describe("OpenTelemetry instrumentation scope name. Empty when not set."),
  scopeVersion: z.string().describe("OpenTelemetry instrumentation scope version. Empty when not set."),
  retentionDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Per-span retention override in days. Omitted when the project default applies."),
  ingestedAt: z.string().describe("ISO-8601 timestamp at which Latitude received this span."),
} as const

const ToolDefinitionSchema = z
  .object({
    name: z.string().describe("Tool name as exposed to the LLM."),
    description: z.string().describe("Tool description as exposed to the LLM."),
    parameters: z.unknown().describe("JSON Schema for the tool's parameters, as provided by the caller."),
  })
  .openapi("ToolDefinition")

const GenAIMessageSchema = z
  .record(z.string(), z.unknown())
  .openapi("GenAISpanMessage")
  .describe("Message in OpenTelemetry GenAI format (`role` + content parts + optional tool calls).")

const GenAISystemSchema = z
  .record(z.string(), z.unknown())
  .openapi("GenAISpanSystem")
  .describe("System instructions in OpenTelemetry GenAI format.")

// Fields returned only on the span detail point-lookup. Conversation content
// (system, input, output messages) and tool data are the agent-facing payload
// you'd actually inspect when drilling into a single span; the OTel raw fields
// (attributes, resource, events, links) round out the full record.
const spanDetailExtras = {
  metadata: z.record(z.string(), z.string()).describe("Free-form metadata attached at ingest time."),
  systemInstructions: GenAISystemSchema,
  inputMessages: z
    .array(GenAIMessageSchema)
    .describe("Input messages sent into this LLM span, in OpenTelemetry GenAI format."),
  outputMessages: z
    .array(GenAIMessageSchema)
    .describe("Output messages returned by this LLM span, in OpenTelemetry GenAI format."),
  toolDefinitions: z
    .array(ToolDefinitionSchema)
    .describe("Tool/function definitions made available to the LLM for this span."),
  toolCallId: z.string().describe("Tool-call id this span answers. Empty when the span isn't an `execute_tool` span."),
  toolName: z.string().describe("Name of the executed tool. Empty when the span isn't an `execute_tool` span."),
  toolInput: z
    .string()
    .describe("Stringified arguments passed to the tool. Empty when the span isn't an `execute_tool` span."),
  toolOutput: z.string().describe("Stringified tool output. Empty when the span isn't an `execute_tool` span."),
  attrString: z.record(z.string(), z.string()).describe("OpenTelemetry attributes with string values."),
  attrInt: z.record(z.string(), z.number()).describe("OpenTelemetry attributes with integer values."),
  attrFloat: z.record(z.string(), z.number()).describe("OpenTelemetry attributes with floating-point values."),
  attrBool: z.record(z.string(), z.boolean()).describe("OpenTelemetry attributes with boolean values."),
  resourceString: z.record(z.string(), z.string()).describe("OpenTelemetry resource attributes captured at ingest."),
  eventsJson: z.string().describe("JSON-encoded OpenTelemetry events array. Empty when the span has no events."),
  linksJson: z.string().describe("JSON-encoded OpenTelemetry span-links array. Empty when the span has no links."),
} as const

export const SpanSchema = z.object(spanListFields).openapi("Span")
export const SpanDetailSchema = z.object({ ...spanListFields, ...spanDetailExtras }).openapi("SpanDetail")

export const toSpanResponse = (span: Span) => ({
  organizationId: span.organizationId as string,
  projectId: span.projectId as string,
  traceId: span.traceId as string,
  spanId: span.spanId as string,
  parentSpanId: emptyToNull(span.parentSpanId),
  sessionId: emptyToNull(span.sessionId as string),
  userId: emptyToNull(span.userId as string),
  simulationId: emptyToNull(span.simulationId as string),
  apiKeyId: emptyToNull(span.apiKeyId),
  startTime: span.startTime.toISOString(),
  endTime: span.endTime.toISOString(),
  name: span.name,
  serviceName: span.serviceName,
  kind: span.kind,
  statusCode: span.statusCode,
  statusMessage: span.statusMessage,
  traceFlags: span.traceFlags,
  traceState: span.traceState,
  errorType: emptyToNull(span.errorType),
  tags: [...span.tags],
  operation: span.operation,
  provider: emptyToNull(span.provider),
  model: emptyToNull(span.model),
  responseModel: emptyToNull(span.responseModel),
  tokensInput: span.tokensInput,
  tokensOutput: span.tokensOutput,
  tokensCacheRead: span.tokensCacheRead,
  tokensCacheCreate: span.tokensCacheCreate,
  tokensReasoning: span.tokensReasoning,
  costInputMicrocents: span.costInputMicrocents,
  costOutputMicrocents: span.costOutputMicrocents,
  costTotalMicrocents: span.costTotalMicrocents,
  costIsEstimated: span.costIsEstimated,
  timeToFirstTokenNs: span.timeToFirstTokenNs,
  isStreaming: span.isStreaming,
  responseId: emptyToNull(span.responseId),
  finishReasons: [...span.finishReasons],
  scopeName: span.scopeName,
  scopeVersion: span.scopeVersion,
  ...(span.retentionDays !== undefined ? { retentionDays: span.retentionDays } : {}),
  ingestedAt: span.ingestedAt.toISOString(),
})

export const toSpanDetailResponse = (span: SpanDetail) => ({
  ...toSpanResponse(span),
  metadata: { ...span.metadata },
  systemInstructions: span.systemInstructions as unknown as Record<string, unknown>,
  inputMessages: span.inputMessages.map((m) => m as unknown as Record<string, unknown>),
  outputMessages: span.outputMessages.map((m) => m as unknown as Record<string, unknown>),
  toolDefinitions: span.toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  })),
  toolCallId: span.toolCallId,
  toolName: span.toolName,
  toolInput: span.toolInput,
  toolOutput: span.toolOutput,
  attrString: { ...span.attrString },
  attrInt: { ...span.attrInt },
  attrFloat: { ...span.attrFloat },
  attrBool: { ...span.attrBool },
  resourceString: { ...span.resourceString },
  eventsJson: span.eventsJson,
  linksJson: span.linksJson,
})
