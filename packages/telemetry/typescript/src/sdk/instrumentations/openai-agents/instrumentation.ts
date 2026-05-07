/**
 * Adapter that forwards spans from the OpenAI Agents SDK
 * (`@openai/agents` / `@openai/agents-core`) into a Latitude OpenTelemetry tracer.
 *
 * The Agents SDK exposes a `TracingProcessor` interface (`onTraceStart`/`onTraceEnd`/
 * `onSpanStart`/`onSpanEnd`/`forceFlush`/`shutdown`) registered via `addTraceProcessor`.
 * Both methods are invoked synchronously from `Span.start()` / `Span.end()`, so
 * `context.active()` here reflects the user's `capture()` boundary.
 */
import {
  type Context,
  context,
  type Span as OtelSpan,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  trace,
} from "@opentelemetry/api"
import { InstrumentationBase } from "@opentelemetry/instrumentation"
import { InstrumentationScope } from "../../../constants/scope.ts"
import { getLatitudeTracer } from "../../tracer.ts"
import {
  buildInputMessages,
  buildMessagesFromList,
  buildOutputMessages,
  deriveFinishReason,
  type ResponseObject,
} from "../openai/messages.ts"

/**
 * Subset of the Agents SDK `TracingProcessor` we rely on. Declared here structurally
 * so the runtime dependency on `@openai/agents` / `@openai/agents-core` stays optional.
 */
interface OpenAIAgentsTracingProcessor {
  start?(): void
  onTraceStart(trace: AgentsTrace): Promise<void>
  onTraceEnd(trace: AgentsTrace): Promise<void>
  onSpanStart(span: AgentsSpan): Promise<void>
  onSpanEnd(span: AgentsSpan): Promise<void>
  shutdown(timeout?: number): Promise<void>
  forceFlush(): Promise<void>
}

/** Subset of `Trace` from `@openai/agents-core`. */
interface AgentsTrace {
  traceId: string
  name: string
  groupId?: string | null
  metadata?: Record<string, unknown> | undefined
}

/** Subset of `Span<SpanData>` from `@openai/agents-core`. */
interface AgentsSpan {
  traceId: string
  spanId: string
  parentId: string | null
  startedAt: string | null
  endedAt: string | null
  error: { message: string; data?: Record<string, unknown> } | null
  spanData: AgentsSpanData
}

type AgentsSpanData =
  | { type: "agent"; name: string; handoffs?: string[]; tools?: string[]; output_type?: string }
  | { type: "function"; name: string; input: string; output: string; mcp_data?: string }
  | {
      type: "generation"
      input?: Array<Record<string, unknown>>
      output?: Array<Record<string, unknown>>
      model?: string
      model_config?: Record<string, unknown>
      usage?: { input_tokens?: number; output_tokens?: number; details?: Record<string, unknown> | null }
    }
  | {
      type: "response"
      response_id?: string
      _input?: string | Array<Record<string, unknown>>
      _response?: Record<string, unknown>
    }
  | { type: "handoff"; from_agent?: string; to_agent?: string }
  | { type: "guardrail"; name: string; triggered: boolean }
  | {
      type: "transcription"
      input: { data: string; format: string }
      output?: string
      model?: string
      model_config?: Record<string, unknown>
    }
  | {
      type: "speech"
      input?: string
      output: { data: string; format: string }
      model?: string
      model_config?: Record<string, unknown>
    }
  | { type: "speech_group"; input?: string }
  | { type: "mcp_tools"; server?: string; result?: string[] }
  | { type: "custom"; name: string; data: Record<string, unknown> }

interface OpenSpanEntry {
  span: OtelSpan
  ctx: Context
}

/**
 * Translates Agents SDK spans into OTel spans on Latitude's tracer.
 *
 * Implementation notes:
 * - We start OTel spans on `onSpanStart` (synchronous with the user's call stack)
 *   so `context.active()` captures the surrounding `capture()` context.
 * - We finalise attributes on `onSpanEnd`, since fields like `model`, `usage`, and
 *   `response_id` are filled in over the span's lifetime.
 * - All spans live under the trace's root span, mirroring the Agents SDK hierarchy.
 */
export class OpenAIAgentsTraceProcessor implements OpenAIAgentsTracingProcessor {
  private readonly tracer: Tracer
  private readonly traces = new Map<string, OpenSpanEntry>()
  private readonly spans = new Map<string, OpenSpanEntry>()

  constructor(tracer: Tracer = getLatitudeTracer(InstrumentationScope.OpenAIAgents)) {
    this.tracer = tracer
  }

  async onTraceStart(t: AgentsTrace): Promise<void> {
    const parentCtx = context.active()
    const otelSpan = this.tracer.startSpan(
      t.name || "openai.agents.trace",
      {
        startTime: new Date(),
        kind: SpanKind.INTERNAL,
        attributes: {
          "latitude.span.kind": "agents.trace",
          "openai.agents.trace_id": t.traceId,
          ...(t.groupId ? { "openai.agents.group_id": t.groupId } : {}),
        },
      },
      parentCtx,
    )
    this.traces.set(t.traceId, { span: otelSpan, ctx: trace.setSpan(parentCtx, otelSpan) })
  }

  async onTraceEnd(t: AgentsTrace): Promise<void> {
    const entry = this.traces.get(t.traceId)
    if (!entry) return
    if (t.metadata && Object.keys(t.metadata).length > 0) {
      entry.span.setAttribute("openai.agents.trace_metadata", safeJson(t.metadata))
    }
    entry.span.end()
    this.traces.delete(t.traceId)
  }

  async onSpanStart(span: AgentsSpan): Promise<void> {
    const parentCtx = this.parentContextFor(span)
    const startedAt = parseTimestamp(span.startedAt)
    const otelSpan = this.tracer.startSpan(
      initialSpanName(span.spanData),
      {
        ...(startedAt ? { startTime: startedAt } : {}),
        kind: SpanKind.INTERNAL,
        attributes: { "latitude.span.kind": `agents.${span.spanData.type}` },
      },
      parentCtx,
    )
    this.spans.set(span.spanId, { span: otelSpan, ctx: trace.setSpan(parentCtx, otelSpan) })
  }

  async onSpanEnd(span: AgentsSpan): Promise<void> {
    const entry = this.spans.get(span.spanId)
    if (!entry) return
    applySpanDataAttributes(entry.span, span.spanData)
    if (span.error) {
      entry.span.setStatus({ code: SpanStatusCode.ERROR, message: span.error.message })
      if (span.error.data) {
        entry.span.setAttribute("exception.data", safeJson(span.error.data))
      }
    }
    const finalName = finalSpanName(span.spanData)
    if (finalName) entry.span.updateName(finalName)
    const endedAt = parseTimestamp(span.endedAt)
    entry.span.end(endedAt ?? undefined)
    this.spans.delete(span.spanId)
  }

  async forceFlush(): Promise<void> {
    // The OTel tracer provider owns flushing; nothing to do here.
  }

  async shutdown(_timeout?: number): Promise<void> {
    // Drain any spans still open at process exit so downstream exporters can flush them.
    for (const [, entry] of this.spans) entry.span.end()
    this.spans.clear()
    for (const [, entry] of this.traces) entry.span.end()
    this.traces.clear()
  }

  private parentContextFor(span: AgentsSpan): Context {
    if (span.parentId) {
      const parent = this.spans.get(span.parentId)
      if (parent) return parent.ctx
    }
    const traceEntry = this.traces.get(span.traceId)
    if (traceEntry) return traceEntry.ctx
    return context.active()
  }
}

/**
 * Bridges the Agents SDK's native tracing API into OTel.
 *
 * Unlike the traceloop-style instrumentations, the Agents SDK exposes its own
 * `addTraceProcessor` extension point — we register `OpenAIAgentsTraceProcessor`
 * with it inside `manuallyInstrument` and have nothing to monkey-patch.
 */
export class OpenAIAgentsInstrumentation extends InstrumentationBase {
  constructor() {
    super("@latitude-data/instrumentation-openai-agents", "1.0.0", {})
  }

  protected init(): [] {
    return []
  }

  manuallyInstrument(module: { addTraceProcessor: (processor: OpenAIAgentsTracingProcessor) => void }): void {
    module.addTraceProcessor(new OpenAIAgentsTraceProcessor())
  }
}

function parseTimestamp(iso: string | null): Date | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function initialSpanName(data: AgentsSpanData): string {
  switch (data.type) {
    case "agent":
      return `agent ${data.name}`
    case "function":
      return `function ${data.name}`
    case "generation":
      return "gen_ai.generate"
    case "response":
      return "gen_ai.response"
    case "handoff":
      return "agent.handoff"
    case "guardrail":
      return `agent.guardrail ${data.name}`
    case "transcription":
      return "audio.transcribe"
    case "speech":
      return "audio.speech"
    case "speech_group":
      return "audio.speech_group"
    case "mcp_tools":
      return data.server ? `mcp.list_tools ${data.server}` : "mcp.list_tools"
    case "custom":
      return data.name
  }
}

function finalSpanName(data: AgentsSpanData): string | null {
  if (data.type === "generation" && data.model) return `gen_ai.generate ${data.model}`
  if (data.type === "response" && "_response" in data) {
    const model = (data._response as { model?: unknown } | undefined)?.model
    if (typeof model === "string") return `gen_ai.response ${model}`
  }
  if (data.type === "handoff" && (data.from_agent || data.to_agent)) {
    return `agent.handoff ${data.from_agent ?? "?"} -> ${data.to_agent ?? "?"}`
  }
  if (data.type === "transcription" && data.model) return `audio.transcribe ${data.model}`
  if (data.type === "speech" && data.model) return `audio.speech ${data.model}`
  return null
}

function applySpanDataAttributes(otelSpan: OtelSpan, data: AgentsSpanData): void {
  switch (data.type) {
    case "agent": {
      otelSpan.setAttribute("openai.agents.name", data.name)
      if (data.handoffs?.length) otelSpan.setAttribute("openai.agents.handoffs", data.handoffs)
      if (data.tools?.length) otelSpan.setAttribute("openai.agents.tools", data.tools)
      if (data.output_type) otelSpan.setAttribute("openai.agents.output_type", data.output_type)
      return
    }
    case "function": {
      otelSpan.setAttribute("openai.agents.function.name", data.name)
      if (data.input) otelSpan.setAttribute("openai.agents.function.input", data.input)
      if (data.output) otelSpan.setAttribute("openai.agents.function.output", data.output)
      if (data.mcp_data) otelSpan.setAttribute("openai.agents.function.mcp_data", data.mcp_data)
      return
    }
    case "generation": {
      otelSpan.setAttribute("gen_ai.system", "openai")
      otelSpan.setAttribute("gen_ai.operation.name", "chat")
      if (data.model) {
        otelSpan.setAttribute("gen_ai.request.model", data.model)
        otelSpan.setAttribute("gen_ai.response.model", data.model)
      }
      if (data.input?.length) {
        otelSpan.setAttribute("gen_ai.input.messages", JSON.stringify(buildMessagesFromList(data.input)))
      }
      if (data.output?.length) {
        otelSpan.setAttribute("gen_ai.output.messages", JSON.stringify(buildMessagesFromList(data.output)))
      }
      if (data.model_config) otelSpan.setAttribute("gen_ai.request.config", safeJson(data.model_config))
      if (data.usage) {
        if (typeof data.usage.input_tokens === "number") {
          otelSpan.setAttribute("gen_ai.usage.input_tokens", data.usage.input_tokens)
        }
        if (typeof data.usage.output_tokens === "number") {
          otelSpan.setAttribute("gen_ai.usage.output_tokens", data.usage.output_tokens)
        }
      }
      return
    }
    case "response": {
      otelSpan.setAttribute("gen_ai.system", "openai")
      otelSpan.setAttribute("gen_ai.operation.name", "chat")
      if (data.response_id) otelSpan.setAttribute("gen_ai.response.id", data.response_id)
      const response = data._response as ResponseObject | undefined
      if (typeof response?.model === "string") {
        otelSpan.setAttribute("gen_ai.request.model", response.model)
        otelSpan.setAttribute("gen_ai.response.model", response.model)
      }
      if (response?.usage) {
        if (typeof response.usage.input_tokens === "number") {
          otelSpan.setAttribute("gen_ai.usage.input_tokens", response.usage.input_tokens)
        }
        if (typeof response.usage.output_tokens === "number") {
          otelSpan.setAttribute("gen_ai.usage.output_tokens", response.usage.output_tokens)
        }
      }
      if (data._input !== undefined) {
        otelSpan.setAttribute("gen_ai.input.messages", JSON.stringify(buildInputMessages({ input: data._input })))
      }
      if (response) {
        otelSpan.setAttribute("gen_ai.output.messages", JSON.stringify(buildOutputMessages(response)))
        const finish = deriveFinishReason(response)
        if (finish) otelSpan.setAttribute("gen_ai.response.finish_reasons", [finish])
      }
      return
    }
    case "handoff": {
      if (data.from_agent) otelSpan.setAttribute("openai.agents.handoff.from", data.from_agent)
      if (data.to_agent) otelSpan.setAttribute("openai.agents.handoff.to", data.to_agent)
      return
    }
    case "guardrail": {
      otelSpan.setAttribute("openai.agents.guardrail.name", data.name)
      otelSpan.setAttribute("openai.agents.guardrail.triggered", data.triggered)
      return
    }
    case "transcription": {
      otelSpan.setAttribute("gen_ai.system", "openai")
      otelSpan.setAttribute("gen_ai.operation.name", "transcribe")
      if (data.model) otelSpan.setAttribute("gen_ai.request.model", data.model)
      if (data.input?.format) otelSpan.setAttribute("openai.agents.audio.input_format", data.input.format)
      if (data.output) otelSpan.setAttribute("gen_ai.output.text", data.output)
      return
    }
    case "speech": {
      otelSpan.setAttribute("gen_ai.system", "openai")
      otelSpan.setAttribute("gen_ai.operation.name", "speech")
      if (data.model) otelSpan.setAttribute("gen_ai.request.model", data.model)
      if (data.input) otelSpan.setAttribute("gen_ai.input.text", data.input)
      if (data.output?.format) otelSpan.setAttribute("openai.agents.audio.output_format", data.output.format)
      return
    }
    case "speech_group": {
      if (data.input) otelSpan.setAttribute("gen_ai.input.text", data.input)
      return
    }
    case "mcp_tools": {
      if (data.server) otelSpan.setAttribute("openai.agents.mcp.server", data.server)
      if (data.result?.length) otelSpan.setAttribute("openai.agents.mcp.tools", data.result)
      return
    }
    case "custom": {
      otelSpan.setAttribute("openai.agents.custom.name", data.name)
      if (data.data && Object.keys(data.data).length > 0) {
        otelSpan.setAttribute("openai.agents.custom.data", safeJson(data.data))
      }
      return
    }
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return "[unserialisable]"
  }
}
