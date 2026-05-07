import { context } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { OpenAIAgentsInstrumentation, OpenAIAgentsTraceProcessor } from "./instrumentation.ts"

interface AgentsTrace {
  traceId: string
  name: string
  groupId?: string | null
  metadata?: Record<string, unknown> | undefined
}

interface AgentsSpan {
  traceId: string
  spanId: string
  parentId: string | null
  startedAt: string | null
  endedAt: string | null
  error: { message: string; data?: Record<string, unknown> } | null
  spanData: Record<string, unknown>
}

function makeTrace(overrides: Partial<AgentsTrace> = {}): AgentsTrace {
  return { traceId: "trace_1", name: "Agent workflow", ...overrides }
}

function makeSpan(spanData: Record<string, unknown>, overrides: Partial<AgentsSpan> = {}): AgentsSpan {
  return {
    traceId: "trace_1",
    spanId: `span_${Math.random().toString(36).slice(2, 8)}`,
    parentId: null,
    startedAt: null,
    endedAt: null,
    error: null,
    spanData,
    ...overrides,
  }
}

describe("OpenAIAgentsTraceProcessor", () => {
  let exporter: InMemorySpanExporter
  let provider: NodeTracerProvider
  let processor: OpenAIAgentsTraceProcessor

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  })

  beforeEach(() => {
    exporter = new InMemorySpanExporter()
    provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
    // Pass the tracer explicitly — `trace.setGlobalTracerProvider` is one-shot,
    // so relying on the default `getLatitudeTracer()` would route spans to the
    // first test's provider for every subsequent test.
    processor = new OpenAIAgentsTraceProcessor(provider.getTracer("test"))
  })

  it("opens a trace span on onTraceStart and closes it on onTraceEnd", async () => {
    const t = makeTrace({ groupId: "g1", metadata: { env: "test" } })
    await processor.onTraceStart(t)
    await processor.onTraceEnd(t)

    await provider.forceFlush()
    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    const span = spans[0]
    if (!span) throw new Error("expected a span")
    expect(span.name).toBe("Agent workflow")
    expect(span.attributes["latitude.span.kind"]).toBe("agents.trace")
    expect(span.attributes["openai.agents.trace_id"]).toBe("trace_1")
    expect(span.attributes["openai.agents.group_id"]).toBe("g1")
    expect(span.attributes["openai.agents.trace_metadata"]).toBe('{"env":"test"}')
  })

  it("emits gen_ai.* attributes for response-type spans (Responses API style)", async () => {
    const t = makeTrace()
    await processor.onTraceStart(t)
    const span = makeSpan({
      type: "response",
      response_id: "resp_1",
      _input: "What's the weather?",
      _response: {
        model: "gpt-4o-mini",
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Sunny." }],
          },
        ],
        usage: { input_tokens: 5, output_tokens: 2 },
      },
    })
    await processor.onSpanStart(span as never)
    await processor.onSpanEnd(span as never)
    await processor.onTraceEnd(t)

    await provider.forceFlush()
    const spans = exporter.getFinishedSpans()
    const responseSpan = spans.find((s) => s.attributes["latitude.span.kind"] === "agents.response")
    if (!responseSpan) throw new Error("expected a response span")

    expect(responseSpan.attributes["gen_ai.system"]).toBe("openai")
    expect(responseSpan.attributes["gen_ai.operation.name"]).toBe("chat")
    expect(responseSpan.attributes["gen_ai.response.id"]).toBe("resp_1")
    expect(responseSpan.attributes["gen_ai.request.model"]).toBe("gpt-4o-mini")
    expect(responseSpan.attributes["gen_ai.response.model"]).toBe("gpt-4o-mini")
    expect(responseSpan.attributes["gen_ai.usage.input_tokens"]).toBe(5)
    expect(responseSpan.attributes["gen_ai.usage.output_tokens"]).toBe(2)
    expect(JSON.parse(responseSpan.attributes["gen_ai.input.messages"] as string)).toEqual([
      { role: "user", parts: [{ type: "text", content: "What's the weather?" }] },
    ])
    expect(JSON.parse(responseSpan.attributes["gen_ai.output.messages"] as string)).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "Sunny." }], finish_reason: "stop" },
    ])
    expect(responseSpan.attributes["gen_ai.response.finish_reasons"]).toEqual(["stop"])
  })

  it("converts Agents SDK function_call_result tool outputs into proper tool messages", async () => {
    const t = makeTrace()
    await processor.onTraceStart(t)
    const span = makeSpan({
      type: "response",
      response_id: "resp_2",
      _input: [
        { role: "user", content: "weather?" },
        { type: "function_call", callId: "fc_1", name: "get_weather", arguments: '{"city":"BCN"}' },
        { type: "function_call_result", callId: "fc_1", name: "get_weather", output: "Sunny, 22°C." },
      ],
      _response: {
        model: "gpt-4o-mini",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "It's sunny." }] }],
      },
    })
    await processor.onSpanStart(span as never)
    await processor.onSpanEnd(span as never)
    await processor.onTraceEnd(t)

    await provider.forceFlush()
    const spans = exporter.getFinishedSpans()
    const responseSpan = spans.find((s) => s.attributes["latitude.span.kind"] === "agents.response")
    if (!responseSpan) throw new Error("expected a response span")
    const messages = JSON.parse(responseSpan.attributes["gen_ai.input.messages"] as string)
    expect(messages).toEqual([
      { role: "user", parts: [{ type: "text", content: "weather?" }] },
      {
        role: "assistant",
        parts: [{ type: "tool_call", name: "get_weather", id: "fc_1", arguments: { city: "BCN" } }],
      },
      {
        role: "tool",
        parts: [{ type: "tool_call_response", id: "fc_1", response: "Sunny, 22°C." }],
      },
    ])
  })

  it("emits gen_ai.* attributes for generation-type spans (Chat Completions style)", async () => {
    const t = makeTrace()
    await processor.onTraceStart(t)
    const span = makeSpan({
      type: "generation",
      model: "gpt-4o-mini",
      input: [{ role: "user", content: "hi" }],
      output: [{ role: "assistant", content: "hello" }],
      usage: { input_tokens: 3, output_tokens: 1 },
    })
    await processor.onSpanStart(span as never)
    await processor.onSpanEnd(span as never)
    await processor.onTraceEnd(t)

    await provider.forceFlush()
    const spans = exporter.getFinishedSpans()
    const generationSpan = spans.find((s) => s.attributes["latitude.span.kind"] === "agents.generation")
    if (!generationSpan) throw new Error("expected a generation span")
    expect(generationSpan.attributes["gen_ai.operation.name"]).toBe("chat")
    expect(generationSpan.attributes["gen_ai.request.model"]).toBe("gpt-4o-mini")
    expect(JSON.parse(generationSpan.attributes["gen_ai.input.messages"] as string)).toEqual([
      { role: "user", parts: [{ type: "text", content: "hi" }] },
    ])
    expect(JSON.parse(generationSpan.attributes["gen_ai.output.messages"] as string)).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "hello" }] },
    ])
    expect(generationSpan.attributes["gen_ai.usage.input_tokens"]).toBe(3)
    expect(generationSpan.attributes["gen_ai.usage.output_tokens"]).toBe(1)
  })

  it("emits openai.agents.function.* attributes for function-tool spans", async () => {
    const t = makeTrace()
    await processor.onTraceStart(t)
    const span = makeSpan({
      type: "function",
      name: "get_weather",
      input: '{"city":"BCN"}',
      output: "Sunny.",
    })
    await processor.onSpanStart(span as never)
    await processor.onSpanEnd(span as never)
    await processor.onTraceEnd(t)

    await provider.forceFlush()
    const spans = exporter.getFinishedSpans()
    const fnSpan = spans.find((s) => s.attributes["latitude.span.kind"] === "agents.function")
    if (!fnSpan) throw new Error("expected a function span")
    expect(fnSpan.attributes["openai.agents.function.name"]).toBe("get_weather")
    expect(fnSpan.attributes["openai.agents.function.input"]).toBe('{"city":"BCN"}')
    expect(fnSpan.attributes["openai.agents.function.output"]).toBe("Sunny.")
  })

  it("propagates errors recorded on the agents span", async () => {
    const t = makeTrace()
    await processor.onTraceStart(t)
    const span = makeSpan(
      { type: "function", name: "broken", input: "{}", output: "" },
      { error: { message: "tool blew up", data: { code: 500 } } },
    )
    await processor.onSpanStart(span as never)
    await processor.onSpanEnd(span as never)
    await processor.onTraceEnd(t)

    await provider.forceFlush()
    const spans = exporter.getFinishedSpans()
    const fnSpan = spans.find((s) => s.attributes["latitude.span.kind"] === "agents.function")
    if (!fnSpan) throw new Error("expected a function span")
    expect(fnSpan.status.message).toBe("tool blew up")
    expect(fnSpan.attributes["exception.data"]).toBe('{"code":500}')
  })

  it("ends any open spans on shutdown so exporters can flush them", async () => {
    const t = makeTrace()
    await processor.onTraceStart(t)
    const span = makeSpan({ type: "function", name: "get_weather", input: "{}", output: "" })
    await processor.onSpanStart(span as never)
    // Intentionally skip onSpanEnd / onTraceEnd
    await processor.shutdown()

    await provider.forceFlush()
    const spans = exporter.getFinishedSpans()
    expect(spans.length).toBeGreaterThanOrEqual(2) // both the trace and the orphan span ended
  })
})

describe("OpenAIAgentsInstrumentation", () => {
  it("registers the trace processor against a host module's addTraceProcessor", () => {
    const calls: unknown[] = []
    const fakeModule = {
      addTraceProcessor: (p: unknown) => {
        calls.push(p)
      },
    }
    const inst = new OpenAIAgentsInstrumentation()
    inst.manuallyInstrument(fakeModule)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toBeInstanceOf(OpenAIAgentsTraceProcessor)
  })
})
