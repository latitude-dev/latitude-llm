import type { Trace, TraceDetail } from "@domain/spans"
import { z } from "@hono/zod-openapi"

const nullableString = () => z.string().nullable()
const emptyToNull = (value: string): string | null => (value === "" ? null : value)

const traceFields = {
  organizationId: z.string().describe("Organization that owns this trace."),
  projectId: z.string().describe("Project this trace belongs to."),
  traceId: z.string().describe("32-character trace identifier."),
  spanCount: z.number().int().nonnegative().describe("Total number of spans in the trace."),
  errorCount: z.number().int().nonnegative().describe("Number of spans flagged with an error status."),
  startTime: z.string().describe("ISO-8601 timestamp of the trace's earliest span."),
  endTime: z.string().describe("ISO-8601 timestamp of the trace's latest span."),
  durationNs: z.number().describe("Wall-clock duration of the trace in nanoseconds."),
  timeToFirstTokenNs: z
    .number()
    .describe("Nanoseconds from the start of the first LLM span to its first emitted token. `0` if not measured."),
  tokensInput: z.number().describe("Total input tokens across LLM spans."),
  tokensOutput: z.number().describe("Total output tokens across LLM spans."),
  tokensCacheRead: z.number().describe("Total tokens served from the provider's prompt cache."),
  tokensCacheCreate: z.number().describe("Total tokens written to the provider's prompt cache."),
  tokensReasoning: z.number().describe("Total reasoning tokens reported by the model."),
  tokensTotal: z.number().describe("Sum of all token counters."),
  costInputMicrocents: z.number().describe("Cost of input tokens in microcents (1/1,000,000 USD)."),
  costOutputMicrocents: z.number().describe("Cost of output tokens in microcents (1/1,000,000 USD)."),
  costTotalMicrocents: z.number().describe("Total cost in microcents (1/1,000,000 USD)."),
  sessionId: nullableString().describe("Conversation/session identifier set by the SDK. `null` when absent."),
  userId: nullableString().describe("End-user identifier set by the SDK. `null` when absent."),
  simulationId: nullableString().describe(
    "CUID of the simulation that produced this trace. `null` when not a simulation.",
  ),
  tags: z.array(z.string()).describe("Free-form tags attached at ingest time."),
  models: z.array(z.string()).describe("Model identifiers seen across the trace's LLM spans."),
  providers: z.array(z.string()).describe("LLM-provider identifiers seen across the trace's spans."),
  serviceNames: z.array(z.string()).describe("OpenTelemetry `service.name` values seen in the trace."),
  rootSpanId: nullableString().describe(
    "Identifier of the trace's root span. `null` when no root span has been ingested.",
  ),
  rootSpanName: nullableString().describe(
    "`name` attribute of the root span. `null` when no root span has been ingested.",
  ),
} as const

export const TraceSchema = z.object(traceFields).openapi("Trace")

const GenAIMessageSchema = z
  .record(z.string(), z.unknown())
  .openapi("GenAIMessage")
  .describe("Message in OpenTelemetry GenAI format (`role` + content parts + optional tool calls).")

const GenAISystemSchema = z
  .record(z.string(), z.unknown())
  .openapi("GenAISystem")
  .describe("System instructions in OpenTelemetry GenAI format.")

export const TraceDetailSchema = z
  .object({
    ...traceFields,
    metadata: z.record(z.string(), z.string()).describe("Free-form metadata attached at ingest time."),
    systemInstructions: GenAISystemSchema,
    inputMessages: z
      .array(GenAIMessageSchema)
      .describe("Input messages sent into the first LLM span of the trace, in OpenTelemetry GenAI format."),
    outputMessages: z
      .array(GenAIMessageSchema)
      .describe("Output messages from the last LLM span of the trace, in OpenTelemetry GenAI format."),
    allMessages: z
      .array(GenAIMessageSchema)
      .describe(
        "Full conversation view for the trace's final turn — the last span's input messages followed by its output messages, in OpenTelemetry GenAI format.",
      ),
  })
  .openapi("TraceDetail")

// ClickHouse doesn't support NULL in our trace columns, so the domain entity
// uses `""` as the absent sentinel for SDK-optional ids. Normalise here so
// the public API surface exposes a proper `string | null` instead of leaking
// the storage-layer encoding.
export const toTraceResponse = (trace: Trace) => ({
  organizationId: trace.organizationId as string,
  projectId: trace.projectId as string,
  traceId: trace.traceId as string,
  spanCount: trace.spanCount,
  errorCount: trace.errorCount,
  startTime: trace.startTime.toISOString(),
  endTime: trace.endTime.toISOString(),
  durationNs: trace.durationNs,
  timeToFirstTokenNs: trace.timeToFirstTokenNs,
  tokensInput: trace.tokensInput,
  tokensOutput: trace.tokensOutput,
  tokensCacheRead: trace.tokensCacheRead,
  tokensCacheCreate: trace.tokensCacheCreate,
  tokensReasoning: trace.tokensReasoning,
  tokensTotal: trace.tokensTotal,
  costInputMicrocents: trace.costInputMicrocents,
  costOutputMicrocents: trace.costOutputMicrocents,
  costTotalMicrocents: trace.costTotalMicrocents,
  sessionId: emptyToNull(trace.sessionId as string),
  userId: emptyToNull(trace.userId as string),
  simulationId: emptyToNull(trace.simulationId as string),
  tags: [...trace.tags],
  models: [...trace.models],
  providers: [...trace.providers],
  serviceNames: [...trace.serviceNames],
  rootSpanId: emptyToNull(trace.rootSpanId as string),
  rootSpanName: emptyToNull(trace.rootSpanName),
})

// rosetta-ai's `GenAIMessage` / `GenAISystem` types declare more specific
// shapes than `Record<string, unknown>` and TS rejects the direct cast as
// non-overlapping. Going through `unknown` is the documented escape hatch —
// the payload IS a JSON object at runtime, the cast is purely a type-level
// bridge for the response schema.
export const toTraceDetailResponse = (trace: TraceDetail) => ({
  ...toTraceResponse(trace),
  metadata: { ...trace.metadata },
  systemInstructions: trace.systemInstructions as unknown as Record<string, unknown>,
  inputMessages: trace.inputMessages.map((m) => m as unknown as Record<string, unknown>),
  outputMessages: trace.outputMessages.map((m) => m as unknown as Record<string, unknown>),
  allMessages: trace.allMessages.map((m) => m as unknown as Record<string, unknown>),
})
