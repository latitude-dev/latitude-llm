import { context, SpanStatusCode, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from "@opentelemetry/semantic-conventions/incubating"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  applyResponseAttributes,
  buildRequestAttributes,
  OpenAIInstrumentationWithResponses,
  type ResponseObject,
} from "./instrumentation.ts"
import {
  buildInputMessageFromItem,
  buildInputMessages,
  buildOutputMessages,
  deriveFinishReason,
  parseMaybeJson,
  resolveOutputText,
} from "./messages.ts"

describe("buildRequestAttributes", () => {
  it("sets system + operation defaults and serialises empty input", () => {
    const attrs = buildRequestAttributes({})
    expect(attrs[ATTR_GEN_AI_OPERATION_NAME]).toBe("chat")
    expect(attrs[ATTR_GEN_AI_PROVIDER_NAME]).toBe("openai")
    expect(attrs[ATTR_GEN_AI_REQUEST_MODEL]).toBeUndefined()
    expect(attrs[ATTR_GEN_AI_INPUT_MESSAGES]).toBe("[]")
  })

  it("emits request params when provided", () => {
    const attrs = buildRequestAttributes({
      model: "gpt-4o-mini",
      max_output_tokens: 50,
      temperature: 0.5,
      top_p: 0.9,
      input: "hi",
    })
    expect(attrs[ATTR_GEN_AI_REQUEST_MODEL]).toBe("gpt-4o-mini")
    expect(attrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS]).toBe(50)
    expect(attrs[ATTR_GEN_AI_REQUEST_TEMPERATURE]).toBe(0.5)
    expect(attrs[ATTR_GEN_AI_REQUEST_TOP_P]).toBe(0.9)
    expect(JSON.parse(attrs[ATTR_GEN_AI_INPUT_MESSAGES] as string)).toEqual([
      { role: "user", parts: [{ type: "text", content: "hi" }] },
    ])
  })

  it("omits unset request params instead of writing undefined", () => {
    const attrs = buildRequestAttributes({ model: "x" })
    expect(ATTR_GEN_AI_REQUEST_MAX_TOKENS in attrs).toBe(false)
    expect(ATTR_GEN_AI_REQUEST_TEMPERATURE in attrs).toBe(false)
    expect(ATTR_GEN_AI_REQUEST_TOP_P in attrs).toBe(false)
  })
})

describe("buildInputMessages", () => {
  it("prepends system message when instructions are provided", () => {
    expect(buildInputMessages({ instructions: "be brief", input: "hi" })).toEqual([
      { role: "system", parts: [{ type: "text", content: "be brief" }] },
      { role: "user", parts: [{ type: "text", content: "hi" }] },
    ])
  })

  it("treats string input as a user text message", () => {
    expect(buildInputMessages({ input: "hello" })).toEqual([
      { role: "user", parts: [{ type: "text", content: "hello" }] },
    ])
  })

  it("walks an array input and delegates to buildInputMessageFromItem", () => {
    const result = buildInputMessages({
      input: [
        { role: "user", content: "a" },
        { type: "function_call", name: "tool", call_id: "c1", arguments: '{"x":1}' },
      ],
    })
    expect(result).toHaveLength(2)
    expect((result[0] as { role: string }).role).toBe("user")
    expect((result[1] as { role: string }).role).toBe("assistant")
  })

  it("returns empty when no input or instructions", () => {
    expect(buildInputMessages({})).toEqual([])
  })
})

describe("buildInputMessageFromItem", () => {
  it("default-types untyped items as message and uses string content", () => {
    expect(buildInputMessageFromItem({ role: "user", content: "hi" })).toEqual({
      role: "user",
      parts: [{ type: "text", content: "hi" }],
    })
  })

  it("flattens text content blocks (input_text/output_text/text)", () => {
    const result = buildInputMessageFromItem({
      role: "user",
      content: [
        { type: "input_text", text: "a" },
        { type: "output_text", text: "b" },
        { type: "text", text: "c" },
      ],
    })
    expect(result.parts).toEqual([
      { type: "text", content: "a" },
      { type: "text", content: "b" },
      { type: "text", content: "c" },
    ])
  })

  it("preserves unknown content block types as generic parts", () => {
    const block = { type: "image", url: "https://x" }
    const result = buildInputMessageFromItem({ role: "user", content: [block] })
    expect(result.parts).toEqual([{ type: "image", content: block }])
  })

  it("maps function_call items to assistant tool_call parts and parses args JSON", () => {
    const result = buildInputMessageFromItem({
      type: "function_call",
      name: "get_weather",
      call_id: "c1",
      arguments: '{"city":"BCN"}',
    })
    expect(result).toEqual({
      role: "assistant",
      parts: [{ type: "tool_call", name: "get_weather", id: "c1", arguments: { city: "BCN" } }],
    })
  })

  it("falls back to id when call_id is missing on function_call items", () => {
    const result = buildInputMessageFromItem({ type: "function_call", id: "c1", name: "n", arguments: "{}" })
    expect((result.parts[0] as { id: string }).id).toBe("c1")
  })

  it("maps function_call_output items to tool messages", () => {
    expect(buildInputMessageFromItem({ type: "function_call_output", call_id: "c1", output: "ok" })).toEqual({
      role: "tool",
      parts: [{ type: "tool_call_response", id: "c1", response: "ok" }],
    })
  })

  it("maps Agents SDK function_call_result (camelCase callId) to tool messages", () => {
    expect(
      buildInputMessageFromItem({
        type: "function_call_result",
        callId: "c1",
        name: "get_weather",
        output: "Sunny, 22°C.",
      }),
    ).toEqual({
      role: "tool",
      parts: [{ type: "tool_call_response", id: "c1", response: "Sunny, 22°C." }],
    })
  })

  it("flattens structured { type: 'text', text } outputs from Agents SDK", () => {
    expect(
      buildInputMessageFromItem({
        type: "function_call_result",
        callId: "c1",
        output: { type: "text", text: "Sunny, 22°C." },
      }),
    ).toEqual({
      role: "tool",
      parts: [{ type: "tool_call_response", id: "c1", response: "Sunny, 22°C." }],
    })
  })

  it("preserves non-text structured outputs verbatim", () => {
    const imageOutput = { type: "image", image: { url: "https://x" } }
    expect(buildInputMessageFromItem({ type: "function_call_result", callId: "c1", output: imageOutput })).toEqual({
      role: "tool",
      parts: [{ type: "tool_call_response", id: "c1", response: imageOutput }],
    })
  })

  it("uses callId on Agents SDK function_call items", () => {
    const result = buildInputMessageFromItem({
      type: "function_call",
      callId: "c1",
      name: "fn",
      arguments: "{}",
    })
    expect((result.parts[0] as { id: string }).id).toBe("c1")
  })

  it("defaults role to user when omitted on message-typed items", () => {
    expect(buildInputMessageFromItem({ content: "hi" })).toEqual({
      role: "user",
      parts: [{ type: "text", content: "hi" }],
    })
  })
})

describe("parseMaybeJson", () => {
  it("returns non-string values unchanged", () => {
    const obj = { x: 1 }
    expect(parseMaybeJson(obj)).toBe(obj)
    expect(parseMaybeJson(42)).toBe(42)
    expect(parseMaybeJson(undefined)).toBeUndefined()
  })

  it("parses valid JSON strings", () => {
    expect(parseMaybeJson('{"x":1}')).toEqual({ x: 1 })
    expect(parseMaybeJson("[1,2]")).toEqual([1, 2])
  })

  it("returns the original string when JSON parsing fails", () => {
    expect(parseMaybeJson("not json")).toBe("not json")
  })
})

describe("deriveFinishReason", () => {
  it("returns stop on completed without tool calls", () => {
    expect(deriveFinishReason({ status: "completed", output: [{ type: "message" }] })).toBe("stop")
  })

  it("returns tool_call on completed with a function_call output block", () => {
    expect(deriveFinishReason({ status: "completed", output: [{ type: "function_call" }] })).toBe("tool_call")
  })

  it("returns tool_call for other tool-like blocks", () => {
    for (const t of ["file_search_call", "web_search_call", "computer_call"]) {
      expect(deriveFinishReason({ status: "completed", output: [{ type: t }] })).toBe("tool_call")
    }
  })

  it("maps incomplete with content_filter reason", () => {
    expect(deriveFinishReason({ status: "incomplete", incomplete_details: { reason: "content_filter" } })).toBe(
      "content_filter",
    )
  })

  it("maps incomplete (other reasons) to length", () => {
    expect(deriveFinishReason({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })).toBe(
      "length",
    )
    expect(deriveFinishReason({ status: "incomplete" })).toBe("length")
  })

  it("maps failed/cancelled to error", () => {
    expect(deriveFinishReason({ status: "failed" })).toBe("error")
    expect(deriveFinishReason({ status: "cancelled" })).toBe("error")
  })

  it("returns empty string for unknown / missing status", () => {
    expect(deriveFinishReason({})).toBe("")
    expect(deriveFinishReason({ status: "in_progress" })).toBe("")
  })
})

describe("resolveOutputText", () => {
  it("returns the top-level output_text shortcut when present", () => {
    expect(resolveOutputText({ output_text: "hello" })).toBe("hello")
  })

  it("derives text from output[] message blocks when shortcut is missing (streaming case)", () => {
    const response: ResponseObject = {
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "Hello " },
            { type: "output_text", text: "world!" },
          ],
        },
      ],
    }
    expect(resolveOutputText(response)).toBe("Hello world!")
  })

  it("ignores non-message blocks and non-text content items", () => {
    const response: ResponseObject = {
      output: [
        { type: "function_call", name: "fn", arguments: "{}" },
        { type: "message", content: [{ type: "refusal", text: "no" } as never] },
        { type: "message", content: [{ type: "output_text", text: "yes" }] },
      ],
    }
    expect(resolveOutputText(response)).toBe("yes")
  })

  it("returns empty string when no output is present", () => {
    expect(resolveOutputText({})).toBe("")
    expect(resolveOutputText({ output: [] })).toBe("")
  })
})

describe("buildOutputMessages", () => {
  it("returns empty array when there is no output", () => {
    expect(buildOutputMessages({ status: "completed" })).toEqual([])
  })

  it("emits a single text part using the shortcut", () => {
    const result = buildOutputMessages({ status: "completed", output_text: "hi" })
    expect(result).toEqual([{ role: "assistant", parts: [{ type: "text", content: "hi" }], finish_reason: "stop" }])
  })

  it("derives text from output[] when the shortcut is absent", () => {
    const result = buildOutputMessages({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "Hello " },
            { type: "output_text", text: "world!" },
          ],
        },
      ],
    })
    expect((result[0] as { parts: { content: string }[] }).parts[0]?.content).toBe("Hello world!")
  })

  it("appends function_call blocks as tool_call parts", () => {
    const result = buildOutputMessages({
      status: "completed",
      output_text: "calling",
      output: [{ type: "function_call", id: "fc1", name: "fn", arguments: '{"x":1}' }],
    })
    expect(result).toEqual([
      {
        role: "assistant",
        parts: [
          { type: "text", content: "calling" },
          { type: "tool_call", name: "fn", id: "fc1", arguments: { x: 1 } },
        ],
        finish_reason: "tool_call",
      },
    ])
  })
})

describe("applyResponseAttributes", () => {
  function makeMockSpan() {
    const calls: Record<string, unknown> = {}
    return {
      setAttribute(key: string, value: unknown) {
        calls[key] = value
        return this
      },
      setStatus() {
        return this
      },
      recordException() {},
      end() {},
      attributes: calls,
    }
  }

  it("ignores nullish responses", () => {
    const span = makeMockSpan()
    applyResponseAttributes(span as never, null as unknown as ResponseObject)
    expect(span.attributes).toEqual({})
  })

  it("emits id, model, usage, finish_reason, and output messages", () => {
    const span = makeMockSpan()
    applyResponseAttributes(span as never, {
      id: "resp_1",
      model: "gpt-4o-mini",
      output_text: "hi",
      usage: { input_tokens: 10, output_tokens: 5 },
      status: "completed",
    })
    expect(span.attributes[ATTR_GEN_AI_RESPONSE_ID]).toBe("resp_1")
    expect(span.attributes[ATTR_GEN_AI_RESPONSE_MODEL]).toBe("gpt-4o-mini")
    expect(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(10)
    expect(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(5)
    expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual(["stop"])
    expect(JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "hi" }], finish_reason: "stop" },
    ])
  })

  it("skips usage attributes when partial / missing", () => {
    const span = makeMockSpan()
    applyResponseAttributes(span as never, { id: "x", usage: {} })
    expect(ATTR_GEN_AI_USAGE_INPUT_TOKENS in span.attributes).toBe(false)
    expect(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS in span.attributes).toBe(false)
  })

  it("does not emit finish_reasons when status is missing", () => {
    const span = makeMockSpan()
    applyResponseAttributes(span as never, { id: "x" })
    expect(ATTR_GEN_AI_RESPONSE_FINISH_REASONS in span.attributes).toBe(false)
  })
})

// -------------------------------------------------------------------------
// Integration tests: real instrumentation, real tracer, real span exporter.
// Verifies that patching `Responses.prototype.create` produces the expected
// span shape end-to-end (non-streaming, streaming, and error paths).
// -------------------------------------------------------------------------

interface FakeResponsesEvent {
  type: string
  delta?: string
  response?: ResponseObject
}

class FakeResponses {
  async create(body: { stream?: boolean }): Promise<unknown> {
    if (body.stream) {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<FakeResponsesEvent> {
          yield { type: "response.created" }
          yield { type: "response.output_text.delta", delta: "Hello " }
          yield { type: "response.output_text.delta", delta: "world!" }
          yield {
            type: "response.completed",
            response: {
              id: "resp_stream",
              model: "gpt-4o-mini",
              status: "completed",
              usage: { input_tokens: 7, output_tokens: 2 },
              output: [
                {
                  type: "message",
                  content: [{ type: "output_text", text: "Hello world!" } as never],
                },
              ],
            },
          }
        },
      }
    }
    return {
      id: "resp_sync",
      model: "gpt-4o-mini",
      status: "completed",
      output_text: "Hi sync",
      usage: { input_tokens: 5, output_tokens: 3 },
      output: [],
    }
  }
}

const FakeOpenAI = (() => {}) as unknown as {
  Responses: typeof FakeResponses
  Chat: { Completions: { prototype: object } }
  Completions: { prototype: object }
}
FakeOpenAI.Responses = FakeResponses
FakeOpenAI.Chat = { Completions: { prototype: { create: () => undefined } } }
FakeOpenAI.Completions = { prototype: { create: () => undefined } }

describe("OpenAIInstrumentationWithResponses", () => {
  let exporter: InMemorySpanExporter
  let provider: NodeTracerProvider
  let inst: OpenAIInstrumentationWithResponses

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  })

  beforeEach(() => {
    exporter = new InMemorySpanExporter()
    provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
    trace.setGlobalTracerProvider(provider)

    inst = new OpenAIInstrumentationWithResponses()
    inst.setTracerProvider(provider)
    inst.manuallyInstrument(FakeOpenAI)
  })

  it("produces a span with full request + response attributes for non-streaming", async () => {
    const client = { responses: new FakeResponses() }
    const result = (await client.responses.create({
      model: "gpt-4o-mini",
      input: "hi",
      max_output_tokens: 50,
    } as never)) as { id: string; output_text: string }

    expect(result.id).toBe("resp_sync")
    expect(result.output_text).toBe("Hi sync")

    await provider.forceFlush()
    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    const span = spans[0]
    if (!span) throw new Error("expected a span")
    expect(span.name).toBe("openai.response gpt-4o-mini")
    expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe("chat")
    expect(span.attributes[ATTR_GEN_AI_PROVIDER_NAME]).toBe("openai")
    expect(span.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe("gpt-4o-mini")
    expect(span.attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS]).toBe(50)
    expect(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(5)
    expect(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(3)
    expect(span.attributes[ATTR_GEN_AI_RESPONSE_ID]).toBe("resp_sync")
    expect(JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "Hi sync" }], finish_reason: "stop" },
    ])
  })

  it("forwards every event and finalises the span on stream completion", async () => {
    const client = { responses: new FakeResponses() }
    const stream = (await client.responses.create({
      model: "gpt-4o-mini",
      input: "stream please",
      stream: true,
    } as never)) as AsyncIterable<FakeResponsesEvent>

    const seen: string[] = []
    const deltas: string[] = []
    for await (const event of stream) {
      seen.push(event.type)
      if (event.type === "response.output_text.delta" && event.delta) deltas.push(event.delta)
    }

    expect(seen).toEqual([
      "response.created",
      "response.output_text.delta",
      "response.output_text.delta",
      "response.completed",
    ])
    expect(deltas.join("")).toBe("Hello world!")

    await provider.forceFlush()
    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    const span = spans[0]
    if (!span) throw new Error("expected a span")
    expect(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(7)
    expect(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(2)
    expect(span.attributes[ATTR_GEN_AI_RESPONSE_ID]).toBe("resp_stream")
    expect(JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "Hello world!" }], finish_reason: "stop" },
    ])
  })

  it("records the error and ends the span when the underlying call rejects", async () => {
    class FailingResponses {
      async create(): Promise<never> {
        throw new Error("boom")
      }
    }
    const FailingModule = (() => {}) as unknown as typeof FakeOpenAI
    FailingModule.Responses = FailingResponses as unknown as typeof FakeResponses
    FailingModule.Chat = FakeOpenAI.Chat
    FailingModule.Completions = FakeOpenAI.Completions

    const failing = new OpenAIInstrumentationWithResponses()
    failing.setTracerProvider(provider)
    failing.manuallyInstrument(FailingModule)

    const client = { responses: new FailingResponses() }
    await expect(client.responses.create()).rejects.toThrow("boom")

    await provider.forceFlush()
    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    const span = spans[0]
    if (!span) throw new Error("expected a span")
    expect(span.status.code).toBe(SpanStatusCode.ERROR)
    expect(span.status.message).toBe("boom")
  })

  it("is a no-op when the module has no Responses class", () => {
    const moduleWithoutResponses = (() => {}) as unknown as typeof FakeOpenAI
    moduleWithoutResponses.Chat = FakeOpenAI.Chat
    moduleWithoutResponses.Completions = FakeOpenAI.Completions
    expect(() => inst.manuallyInstrument(moduleWithoutResponses)).not.toThrow()
  })
})
