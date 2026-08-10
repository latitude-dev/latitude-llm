import { OrganizationId, ProjectId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { buildSpanFromNormalized, mapSourceId } from "./normalize-span.ts"

/** rosetta-ai stamps the message index a system instruction was lifted from. */
const SYSTEM_META = { _provider_metadata: { _known_fields: { messageIndex: 0 } } }

const BASE = {
  organizationId: OrganizationId("12345678-1234-4234-9234-123456789012"),
  projectId: ProjectId("project-test"),
  source: "langfuse" as const,
  traceIdSource: "trace",
  spanIdSource: "span",
  sessionId: "session",
  userId: "user",
  name: "generation",
  operation: "chat",
  model: "gpt-4o-mini",
  tags: [],
  metadata: {},
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  ingestedAt: new Date("2026-01-01T00:00:02.000Z"),
  retentionDays: 30,
  statusCode: "ok" as const,
  statusMessage: "",
}

const buildSpan = (input?: unknown, output?: unknown) => buildSpanFromNormalized({ ...BASE, input, output })

describe("mapSourceId", () => {
  it("is deterministic for the same source id", () => {
    expect(mapSourceId("trace", "langfuse", "trace-1", 32)).toBe(mapSourceId("trace", "langfuse", "trace-1", 32))
  })

  it.each([
    ["trace", 32 as const],
    ["span", 16 as const],
  ])("produces a %s id of the right hex width", (kind, length) => {
    const id = mapSourceId(kind as "trace" | "span", "langfuse", "some-vendor-id", length)

    expect(id).toMatch(new RegExp(`^[0-9a-f]{${length}}$`))
  })

  it("keeps an id that is already an OTEL-shaped hex trace id", () => {
    const otelTraceId = "4bf92f3577b34da6a3ce929d0e0e4736"

    expect(mapSourceId("trace", "langfuse", otelTraceId, 32)).toBe(otelTraceId)
  })

  it("keeps an OTEL-shaped span id and normalizes its case", () => {
    expect(mapSourceId("span", "langfuse", "00F067AA0BA902B7", 16)).toBe("00f067aa0ba902b7")
  })

  it("keeps a dashed UUID that is 32 hex characters once stripped", () => {
    expect(mapSourceId("trace", "langsmith", "4bf92f35-77b3-4da6-a3ce-929d0e0e4736", 32)).toBe(
      "4bf92f3577b34da6a3ce929d0e0e4736",
    )
  })

  it("hashes an id of the wrong width rather than truncating it", () => {
    const uuid = "4bf92f35-77b3-4da6-a3ce-929d0e0e4736"

    // A 32-hex UUID is not a valid 16-hex span id, so it must be hashed, not sliced.
    expect(mapSourceId("span", "langsmith", uuid, 16)).not.toBe("4bf92f3577b34da6")
    expect(mapSourceId("span", "langsmith", uuid, 16)).toMatch(/^[0-9a-f]{16}$/)
  })

  it("separates the same id string across different sources", () => {
    // Without the source in the hash input, two vendors reusing an id would collapse
    // into one Latitude trace under ReplacingMergeTree.
    expect(mapSourceId("trace", "langfuse", "shared-id", 32)).not.toBe(
      mapSourceId("trace", "braintrust", "shared-id", 32),
    )
    expect(mapSourceId("trace", "langsmith", "shared-id", 32)).not.toBe(
      mapSourceId("trace", "braintrust", "shared-id", 32),
    )
  })

  it("separates trace ids from span ids derived from the same source id", () => {
    expect(mapSourceId("trace", "langfuse", "same", 32).slice(0, 16)).not.toBe(
      mapSourceId("span", "langfuse", "same", 16),
    )
  })

  it("gives different ids to different sources' ids", () => {
    const ids = new Set([
      mapSourceId("span", "langfuse", "a", 16),
      mapSourceId("span", "langfuse", "b", 16),
      mapSourceId("span", "langsmith", "a", 16),
      mapSourceId("span", "braintrust", "a", 16),
    ])

    expect(ids.size).toBe(4)
  })
})

describe("buildSpanFromNormalized id mapping", () => {
  it("maps trace, span and parent ids to hex and leaves a root parent empty", () => {
    const span = buildSpanFromNormalized({
      ...BASE,
      traceIdSource: "trace-1",
      spanIdSource: "span-1",
      parentSpanIdSource: "parent-1",
    })

    expect(span.traceId).toBe(mapSourceId("trace", "langfuse", "trace-1", 32))
    expect(span.spanId).toBe(mapSourceId("span", "langfuse", "span-1", 16))
    expect(span.parentSpanId).toBe(mapSourceId("span", "langfuse", "parent-1", 16))
  })

  it("leaves parentSpanId empty when the source has no parent", () => {
    expect(buildSpanFromNormalized({ ...BASE, parentSpanIdSource: null }).parentSpanId).toBe("")
    expect(buildSpanFromNormalized({ ...BASE, parentSpanIdSource: "" }).parentSpanId).toBe("")
    expect(buildSpanFromNormalized(BASE).parentSpanId).toBe("")
  })

  it("leaves imported spans unattributed to an api key", () => {
    const span = buildSpan("hello", "hi")

    expect(span.apiKeyId).toBe("")
    expect(span.simulationId).toBe("")
  })

  it("carries the retention window through so imports respect the org's plan", () => {
    expect(buildSpan("hello", "hi").retentionDays).toBe(30)
  })
})

describe("buildSpanFromNormalized content normalization", () => {
  it("normalizes plain input and output strings into GenAI messages", () => {
    const span = buildSpan("hello", "hi there")

    expect(span.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hello" }] }])
    expect(span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "hi there" }] }])
  })

  // Same treatment live ingestion gives a system message: it belongs in its own column, not
  // in the conversation, so the trace view can show it as instructions.
  it("lifts a system message out of the conversation into systemInstructions", () => {
    const span = buildSpan(
      [
        { role: "system", content: "be concise" },
        { role: "user", content: "What is 2+2?" },
      ],
      { role: "assistant", content: "4" },
    )

    expect(span.systemInstructions).toEqual([{ type: "text", content: "be concise", ...SYSTEM_META }])
    expect(span.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "What is 2+2?" }] }])
    expect(span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "4" }] }])
  })

  it("normalizes OpenAI-style content parts", () => {
    const span = buildSpan(
      {
        role: "user",
        content: [
          { type: "text", text: "Look at this" },
          { type: "image_url", image_url: { url: "https://example.com/image.png" } },
        ],
      },
      { role: "assistant", content: [{ type: "output_text", text: "Nice image" }] },
    )

    expect(span.inputMessages).toEqual([
      {
        role: "user",
        parts: [
          { type: "text", content: "Look at this" },
          { type: "uri", uri: "https://example.com/image.png", modality: "image" },
        ],
      },
    ])
    expect(span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "Nice image" }] }])
  })

  it("maps a base64 data URL into a blob part", () => {
    const span = buildSpan({
      role: "user",
      content: [
        { type: "text", text: "What is in this image?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
      ],
    })

    expect(span.inputMessages).toEqual([
      {
        role: "user",
        parts: [
          { type: "text", content: "What is in this image?" },
          { type: "blob", modality: "image", mime_type: "image/png", content: "aGVsbG8=" },
        ],
      },
    ])
  })

  it("translates a tool call and its result", () => {
    const span = buildSpan([
      { role: "user", content: "Weather in SF?" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"SF"}' } }],
      },
      { role: "tool", content: '{"tempC":21}', tool_call_id: "call_1", name: "get_weather" },
    ])

    expect(span.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "Weather in SF?" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", content: "" },
          { type: "tool_call", id: "call_1", name: "get_weather", arguments: { city: "SF" } },
        ],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "call_1", response: '{"tempC":21}' }] },
    ])
  })

  // A source that logs one conversation per span rather than a request and a response.
  it("splits a whole exchange recorded on one side, taking the trailing assistant turn as output", () => {
    const span = buildSpan(undefined, [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello back" },
    ])

    expect(span.systemInstructions).toEqual([{ type: "text", content: "You are helpful.", ...SYSTEM_META }])
    expect(span.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Hi" }] }])
    expect(span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "Hello back" }] }])
  })

  it("keeps both sides separate when each carries its own messages", () => {
    const span = buildSpan([{ role: "user", content: "Hi" }], [{ role: "assistant", content: "Hello" }])

    expect(span.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Hi" }] }])
    expect(span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "Hello" }] }])
  })

  it("normalizes nested messages payloads", () => {
    const span = buildSpan(
      { messages: [{ role: "user", content: "nested input" }] },
      JSON.stringify({ messages: [{ role: "assistant", content: "nested output" }] }),
    )

    expect(span.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "nested input" }] }])
    expect(span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "nested output" }] }])
  })

  it("preserves arbitrary JSON payloads as text", () => {
    const span = buildSpan({ question: "What is 2+2?" }, { answer: 4 })

    expect(span.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: '{"question":"What is 2+2?"}' }] },
    ])
    expect(span.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: '{"answer":4}' }] }])
  })

  // An array whose entries are not all messages is not a conversation, so it stays text rather
  // than being translated into messages invented from whichever entries happened to have a role.
  it("does not throw on malformed unknown values", () => {
    const malformed = () => buildSpan({ unexpected: Symbol("bad") }, [null, 1, { role: "assistant" }])

    expect(malformed).not.toThrow()
    expect(malformed().inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "{}" }] }])
    expect(malformed().outputMessages).toEqual([
      { role: "assistant", parts: [{ type: "text", content: '[null,1,{"role":"assistant"}]' }] },
    ])
  })

  it("carries no messages at all when the source recorded no content", () => {
    const span = buildSpan(undefined, undefined)

    expect(span.inputMessages).toEqual([])
    expect(span.outputMessages).toEqual([])
    expect(span.systemInstructions).toEqual([])
  })
})

describe("buildSpanFromNormalized tool definitions", () => {
  it("reads the tools a request payload declared alongside its messages", () => {
    const span = buildSpan({
      messages: [{ role: "user", content: "Weather in SF?" }],
      tools: [
        {
          type: "function",
          function: { name: "get_weather", description: "Look up weather", parameters: { type: "object" } },
        },
      ],
    })

    expect(span.toolDefinitions).toEqual([
      { name: "get_weather", description: "Look up weather", parameters: { type: "object" } },
    ])
    expect(span.toolNames).toEqual(["get_weather"])
  })

  it("leaves them empty when the source recorded only the messages", () => {
    const span = buildSpan([{ role: "user", content: "Hi" }])

    expect(span.toolDefinitions).toEqual([])
    expect(span.toolNames).toEqual([])
  })
})

describe("buildSpanFromNormalized tool execution", () => {
  const buildToolSpan = (input: unknown, output: unknown) =>
    buildSpanFromNormalized({ ...BASE, name: "get_weather", operation: "execute_tool", model: "", input, output })

  it("names the tool after the span and keeps its arguments and result", () => {
    const span = buildToolSpan({ city: "SF" }, { tempC: 21 })

    expect(span.toolName).toBe("get_weather")
    expect(span.toolInput).toBe('{"city":"SF"}')
    expect(span.toolOutput).toBe('{"tempC":21}')
  })

  it("keeps a string argument verbatim rather than re-encoding it as JSON", () => {
    expect(buildToolSpan("SF", "sunny").toolInput).toBe("SF")
  })

  // Arguments are not a conversation. Rendering them as messages too would show a turn the
  // agent never took, on top of the tool section that already displays them properly.
  it("does not also render the arguments as chat messages", () => {
    const span = buildToolSpan({ city: "SF" }, { tempC: 21 })

    expect(span.inputMessages).toEqual([])
    expect(span.outputMessages).toEqual([])
    expect(span.systemInstructions).toEqual([])
  })

  // Resolved from the row here rather than passed in by an adapter, and gated on the operation the
  // way ingest gates it: a `tool_call_id` a caller left on an LLM span answers no call this span made.
  it("resolves the tool call id from the row, and only for a tool span", () => {
    const metadata = { tool_call_id: "call_9" }

    expect(buildSpanFromNormalized({ ...BASE, operation: "execute_tool", metadata }).toolCallId).toBe("call_9")
    expect(buildSpanFromNormalized({ ...BASE, metadata }).toolCallId).toBe("")
  })

  it("leaves the tool columns empty for a span that executed no tool", () => {
    const span = buildSpan({ city: "SF" }, { tempC: 21 })

    expect(span.operation).toBe("chat")
    expect(span.toolName).toBe("")
    expect(span.toolInput).toBe("")
    expect(span.toolOutput).toBe("")
    expect(span.toolCallId).toBe("")
  })
})

describe("buildSpanFromNormalized time to first token", () => {
  const START = new Date("2026-01-01T00:00:00.000Z")
  const END = new Date("2026-01-01T00:00:10.000Z")
  const timed = (extra: Partial<Parameters<typeof buildSpanFromNormalized>[0]>) =>
    buildSpanFromNormalized({ ...BASE, startTime: START, endTime: END, ...extra })

  it("derives it from the first token's timestamp", () => {
    const span = timed({ firstTokenAt: new Date("2026-01-01T00:00:00.250Z") })

    expect(span.timeToFirstTokenNs).toBe(250_000_000)
  })

  it("takes a duration the source reported directly", () => {
    expect(timed({ timeToFirstTokenNs: 400_000_000 }).timeToFirstTokenNs).toBe(400_000_000)
  })

  // The shape a seconds-versus-milliseconds mix-up takes, and the only way to catch one without
  // knowing the source's unit: a first token cannot arrive after the call finished.
  it("discards a value longer than the span itself", () => {
    expect(timed({ timeToFirstTokenNs: 60 * 1_000_000_000 }).timeToFirstTokenNs).toBe(0)
  })

  it("ignores a first-token timestamp before the span started", () => {
    expect(timed({ firstTokenAt: new Date("2025-12-31T23:59:00.000Z") }).timeToFirstTokenNs).toBe(0)
  })

  it.each([
    [
      "a measured first token means the response streamed",
      { firstTokenAt: new Date("2026-01-01T00:00:01.000Z") },
      true,
    ],
    ["nothing measured means it did not", {}, false],
  ])("infers streaming: %s", (_label, extra, expected) => {
    expect(timed(extra).isStreaming).toBe(expected)
  })

  it("lets the source say it streamed even with no first-token time", () => {
    expect(timed({ isStreaming: true }).isStreaming).toBe(true)
  })
})

describe("buildSpanFromNormalized passthrough fields", () => {
  it("names the agent after the span for an agent invocation", () => {
    const span = buildSpanFromNormalized({ ...BASE, name: "research-agent", operation: "invoke_agent" })

    expect(span.agentName).toBe("research-agent")
  })

  it("leaves agentName empty for anything else", () => {
    expect(buildSpan().agentName).toBe("")
  })

  it.each([
    ["userEmail", { userEmail: "a@b.com" }, "userEmail", "a@b.com"],
    ["responseId", { responseId: "resp_1" }, "responseId", "resp_1"],
    ["scopeName", { scopeName: "langchain" }, "scopeName", "langchain"],
    ["scopeVersion", { scopeVersion: "0.3.1" }, "scopeVersion", "0.3.1"],
    ["eventsJson", { eventsJson: '[{"name":"new_token"}]' }, "eventsJson", '[{"name":"new_token"}]'],
  ] as const)("carries %s through", (_label, extra, field, expected) => {
    expect(buildSpanFromNormalized({ ...BASE, ...extra })[field]).toBe(expected)
  })

  it("carries finish reasons through", () => {
    expect(buildSpanFromNormalized({ ...BASE, finishReasons: ["stop"] }).finishReasons).toEqual(["stop"])
  })

  it("defaults eventsJson and linksJson to empty arrays rather than empty strings", () => {
    const span = buildSpan()

    expect(span.eventsJson).toBe("[]")
    expect(span.linksJson).toBe("[]")
  })

  // Never a literal "error" for an unnamed failure: that reads as a real exception class and
  // collapses every distinct failure into one group in the errored-span breakdown. Live ingest
  // leaves it empty when a span carries no `error.type`, so an import does the same.
  it("uses the source's error type, then the OTEL attribute, and otherwise leaves it empty", () => {
    const errored = { ...BASE, statusCode: "error" as const }

    expect(buildSpanFromNormalized({ ...errored, errorType: "RateLimitError" }).errorType).toBe("RateLimitError")
    expect(
      buildSpanFromNormalized({ ...errored, metadata: { "attributes.exception.type": "ToolRetryError" } }).errorType,
    ).toBe("ToolRetryError")
    expect(buildSpanFromNormalized(errored).errorType).toBe("")
    expect(buildSpan().errorType).toBe("")
  })

  it("reads tool definitions from a dedicated payload before the input", () => {
    const span = buildSpanFromNormalized({
      ...BASE,
      toolsPayload: { tools: [{ type: "function", function: { name: "from_params" } }] },
      input: { tools: [{ type: "function", function: { name: "from_input" } }] },
    })

    expect(span.toolNames).toEqual(["from_params"])
  })
})

describe("buildSpanFromNormalized token breakdown", () => {
  it("stores an additive breakdown the source broke out itself", () => {
    const span = buildSpanFromNormalized({
      ...BASE,
      tokens: { tokensInput: 100, tokensOutput: 50, tokensCacheRead: 20, tokensCacheCreate: 10, tokensReasoning: 5 },
    })

    expect(span.tokensInput).toBe(100)
    expect(span.tokensOutput).toBe(50)
    expect(span.tokensCacheRead).toBe(20)
    expect(span.tokensCacheCreate).toBe(10)
    expect(span.tokensReasoning).toBe(5)
  })

  // Splitting the flat pair would need to know whether the source's input count already includes
  // cached tokens, which none of them states — and getting it wrong moves tokens out of the count
  // the trace rollup bills on.
  it("leaves the cache and reasoning columns at zero when the source reported only two totals", () => {
    const span = buildSpanFromNormalized({ ...BASE, tokensInput: 100, tokensOutput: 50 })

    expect(span.tokensInput).toBe(100)
    expect(span.tokensCacheRead).toBe(0)
    expect(span.tokensCacheCreate).toBe(0)
    expect(span.tokensReasoning).toBe(0)
  })
})

describe("buildSpanFromNormalized cost", () => {
  const withUsage = (extra: Partial<Parameters<typeof buildSpanFromNormalized>[0]>) =>
    buildSpanFromNormalized({ ...BASE, tokensInput: 1_000, tokensOutput: 500, ...extra })

  it("prices the span from models.dev when the source reported no cost", () => {
    const span = withUsage({ provider: "openai", model: "gpt-4o-mini" })

    expect(span.costIsEstimated).toBe(true)
    expect(span.costInputMicrocents).toBeGreaterThan(0)
    expect(span.costOutputMicrocents).toBeGreaterThan(0)
    expect(span.costTotalMicrocents).toBe(span.costInputMicrocents + span.costOutputMicrocents)
  })

  it("prefers the source's own figure over an estimate, since the source saw the real rate", () => {
    const span = withUsage({
      provider: "openai",
      model: "gpt-4o-mini",
      cost: { inputUsd: 0.001, outputUsd: 0.002, totalUsd: 0.003 },
    })

    expect(span.costIsEstimated).toBe(false)
    expect(span.costInputMicrocents).toBe(100_000)
    expect(span.costOutputMicrocents).toBe(200_000)
    expect(span.costTotalMicrocents).toBe(300_000)
  })

  // Braintrust's shape: it prices the call but breaks out no sides. Estimating them beside its own
  // total is what live ingestion does with a span carrying only a total attribute, and it beats two
  // zeros that read as "both halves were free".
  it("estimates the sides beside the source's total when it breaks out none", () => {
    const span = withUsage({ provider: "openai", model: "gpt-4o-mini", cost: { totalUsd: 0.005 } })

    expect(span.costTotalMicrocents).toBe(500_000)
    expect(span.costInputMicrocents).toBeGreaterThan(0)
    expect(span.costOutputMicrocents).toBeGreaterThan(0)
    expect(span.costIsEstimated).toBe(true)
    expect(span.costSource).toBe("provider_reported")
  })

  // A stated zero is a claim, not an absence: the source priced the call at nothing.
  it("keeps a side the source stated as zero rather than estimating over it", () => {
    const span = withUsage({
      provider: "openai",
      model: "gpt-4o-mini",
      cost: { inputUsd: 0, outputUsd: 0, totalUsd: 0.005 },
    })

    expect(span.costInputMicrocents).toBe(0)
    expect(span.costOutputMicrocents).toBe(0)
    expect(span.costTotalMicrocents).toBe(500_000)
    expect(span.costIsEstimated).toBe(false)
  })

  // The provider is half of the models.dev key, so without it there is no price to look up
  // and reporting a guess would be worse than reporting nothing.
  it("leaves cost at zero when no provider is known and the source priced nothing", () => {
    const span = withUsage({ model: "gpt-4o-mini" })

    expect(span.costTotalMicrocents).toBe(0)
    expect(span.costIsEstimated).toBe(false)
  })

  it("leaves cost at zero for a span with no tokens", () => {
    const span = buildSpanFromNormalized({ ...BASE, provider: "openai", model: "gpt-4o-mini" })

    expect(span.costTotalMicrocents).toBe(0)
    expect(span.costIsEstimated).toBe(false)
  })

  it("still reports zero cost as unestimated when the model is not in models.dev", () => {
    const span = withUsage({ provider: "openai", model: "some-model-that-does-not-exist" })

    expect(span.costTotalMicrocents).toBe(0)
    expect(span.costIsEstimated).toBe(false)
  })
})

// `cost_source` is what lets a stored 0 be read, and the unpriced rollup counts on it. An imported
// span has to classify on the same terms as an ingested one or the same call reads differently
// depending on how it arrived.
describe("buildSpanFromNormalized cost source", () => {
  const withUsage = (extra: Partial<Parameters<typeof buildSpanFromNormalized>[0]>) =>
    buildSpanFromNormalized({ ...BASE, tokensInput: 1_000, tokensOutput: 500, ...extra })

  it("records a source-supplied cost as reported, and names no catalog entry for it", () => {
    const span = withUsage({
      provider: "openai",
      model: "gpt-4o-mini",
      cost: { inputUsd: 0.001, outputUsd: 0.002, totalUsd: 0.003 },
    })

    expect(span.costSource).toBe("provider_reported")
    expect(span.costPricedProvider).toBe("")
    expect(span.costPricedModel).toBe("")
  })

  it("names the catalog entry an estimate was priced from", () => {
    const span = withUsage({ provider: "openai", model: "gpt-4o-mini" })

    expect(span.costSource).toBe("estimated")
    expect(span.costPricedProvider).toBe("openai")
    expect(span.costPricedModel).toBe("gpt-4o-mini")
  })

  // The distinction the column exists for: this 0 understates real spend, where `no_tokens` does not.
  it("marks reported tokens no pricing matched as unpriced rather than free", () => {
    const span = withUsage({ provider: "openai", model: "some-model-that-does-not-exist" })

    expect(span.costSource).toBe("unpriced")
    expect(span.costTotalMicrocents).toBe(0)
  })

  it("marks a span with nothing to price as no_tokens", () => {
    const span = buildSpanFromNormalized({ ...BASE, provider: "openai", model: "gpt-4o-mini" })

    expect(span.costSource).toBe("no_tokens")
  })
})
