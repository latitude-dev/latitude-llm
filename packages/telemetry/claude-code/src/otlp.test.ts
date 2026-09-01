import { describe, expect, it } from "vitest"
import { buildOtlpRequest, buildSubagentSpans, chunkOtlpRequest } from "./otlp.ts"
import type { StoredRequest } from "./request-store.ts"
import type {
  AgentSpanLink,
  AssistantCall,
  MemoryEmitOptions,
  OtlpKeyValue,
  SubagentInvocation,
  ToolCall,
  Turn,
  Usage,
} from "./types.ts"

function unwrap<T>(value: T | undefined | null): T {
  expect(value).toBeDefined()
  if (value === undefined || value === null) {
    throw new Error("expected defined value")
  }
  return value
}

function otlpSpans(req: ReturnType<typeof buildOtlpRequest>) {
  const rs = unwrap(req.resourceSpans[0])
  const ss = unwrap(rs.scopeSpans[0])
  return ss.spans
}

function getAttr(attrs: OtlpKeyValue[], key: string): string | undefined {
  const a = attrs.find((x) => x.key === key)
  return a?.value?.stringValue ?? a?.value?.intValue
}

interface LegacyTurnOpts {
  userText?: string
  assistantText?: string
  model?: string
  tokens?: Usage
  toolCalls?: (Partial<ToolCall> & Pick<ToolCall, "id" | "name" | "input">)[]
  startMs?: number
  endMs?: number
  calls?: AssistantCall[]
  messageId?: string
}

function baseTurn(overrides: LegacyTurnOpts = {}): Turn {
  const startMs = overrides.startMs ?? 1_000
  const endMs = overrides.endMs ?? 2_000
  if (overrides.calls) {
    return { userText: overrides.userText ?? "hello", calls: overrides.calls, startMs, endMs }
  }
  const toolUses: ToolCall[] = (overrides.toolCalls ?? []).map((tc) => {
    const call: ToolCall = {
      id: tc.id,
      name: tc.name,
      input: tc.input,
      startMs: tc.startMs ?? startMs,
      endMs: tc.endMs ?? endMs,
    }
    if (tc.output !== undefined) call.output = tc.output
    if (tc.isError !== undefined) call.isError = tc.isError
    if (tc.promptId !== undefined) call.promptId = tc.promptId
    if (tc.subagent !== undefined) call.subagent = tc.subagent
    return call
  })
  return {
    userText: overrides.userText ?? "hello",
    startMs,
    endMs,
    calls: [
      {
        messageId: overrides.messageId ?? "msg_1",
        model: overrides.model ?? "claude-sonnet-4-6",
        text: overrides.assistantText ?? "hi there",
        toolUses,
        tokens: overrides.tokens ?? { input_tokens: 10, output_tokens: 5 },
        startMs,
        endMs,
      },
    ],
  }
}

describe("buildOtlpRequest inherited context", () => {
  const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736"
  const SPAN = "00f067aa0ba902b7"

  it("joins the inherited trace and parents the interaction under the given span", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [baseTurn()],
      inherited: { traceId: TRACE, parentSpanId: SPAN },
    })

    const spans = otlpSpans(req)
    expect(spans.every((s) => s.traceId === TRACE)).toBe(true)
    expect(unwrap(spans[0]).parentSpanId).toBe(SPAN)
  })

  it("roots its own per-turn trace when no context is inherited", () => {
    const spans = otlpSpans(buildOtlpRequest({ sessionId: "sess-1", turnStartNumber: 1, turns: [baseTurn()] }))
    expect(unwrap(spans[0]).traceId).not.toBe(TRACE)
    expect(unwrap(spans[0]).parentSpanId).toBe("")
  })

  it("keeps span ids distinct across turns that share one inherited trace", () => {
    // Every turn joins the same trace, so the per-turn trace id no longer separates
    // ids. Calls without a message id fall back to `noid:<index>`, which repeats on
    // every turn — turn 2 call 0 would reuse turn 1 call 0's span id if the turn
    // coordinates were not part of the salt.
    const noid = (): Turn => baseTurn({ messageId: "noid:0" })
    const ids = [1, 2, 3].flatMap((turnNum) =>
      otlpSpans(
        buildOtlpRequest({
          sessionId: "sess-1",
          turnStartNumber: turnNum,
          turns: [noid()],
          inherited: { traceId: TRACE, parentSpanId: SPAN },
        }),
      ).map((s) => s.spanId),
    )

    expect(new Set(ids).size).toBe(ids.length)
  })

  it("keeps span ids distinct across two children of the same parent span", () => {
    // One Hermes run hands every child it launches the same trace id and the same
    // LATITUDE_SESSION_ID, and each child starts counting turns at 1. Only Claude's
    // own session id, which is per process, separates them.
    const child = (localSessionId: string) =>
      otlpSpans(
        buildOtlpRequest({
          sessionId: "hermes-sess",
          localSessionId,
          turnStartNumber: 1,
          turns: [baseTurn({ messageId: "noid:0" })],
          inherited: { traceId: TRACE, parentSpanId: SPAN },
        }),
      ).map((s) => s.spanId)

    const ids = [...child("claude-a"), ...child("claude-b")]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("is deterministic, so a re-sent turn produces identical span ids", () => {
    const build = () =>
      otlpSpans(
        buildOtlpRequest({
          sessionId: "sess-1",
          turnStartNumber: 2,
          turns: [baseTurn()],
          inherited: { traceId: TRACE, parentSpanId: SPAN },
        }),
      ).map((s) => s.spanId)

    expect(build()).toEqual(build())
  })

  it("leaves owned-trace span ids unchanged", () => {
    // Guards the upgrade path: a session already mid-flight when the emitter updates
    // must keep producing the ids it produced before, or its next Stop re-inserts
    // spans the additive trace rollups would double-count.
    const spans = otlpSpans(buildOtlpRequest({ sessionId: "sess-1", turnStartNumber: 1, turns: [baseTurn()] }))
    expect(unwrap(spans[0]).traceId).toBe("b1b3bad40622b42bb0aad1e39cc45fcf")
    expect(unwrap(spans[0]).spanId).toBe("6168b591e06f449b")
  })
})

describe("buildOtlpRequest", () => {
  it("emits one interaction + one llm_request span per turn", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [baseTurn()],
    })

    const spans = otlpSpans(req)
    expect(spans).toHaveLength(2)
    expect(getAttr(unwrap(spans[0]).attributes, "span.type")).toBe("interaction")
    expect(getAttr(unwrap(spans[1]).attributes, "span.type")).toBe("llm_request")
  })

  it("sets service.name=claude-code on the resource", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [baseTurn()],
    })

    const resAttrs = unwrap(req.resourceSpans[0]).resource.attributes
    expect(getAttr(resAttrs, "service.name")).toBe("claude-code")
  })

  it("puts user prompt on interaction span and messages on llm_request", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [baseTurn({ userText: "run it", assistantText: "done" })],
    })

    const [interaction, llm] = otlpSpans(req)

    expect(getAttr(interaction.attributes, "user_prompt")).toBe("run it")
    expect(getAttr(interaction.attributes, "user_prompt_length")).toBe("6")

    const inputMsgs = getAttr(llm.attributes, "gen_ai.input.messages")
    const outputMsgs = getAttr(llm.attributes, "gen_ai.output.messages")
    expect(JSON.parse(unwrap(inputMsgs))).toEqual([{ role: "user", parts: [{ type: "text", content: "run it" }] }])
    expect(JSON.parse(unwrap(outputMsgs))).toEqual([{ role: "assistant", parts: [{ type: "text", content: "done" }] }])
  })

  it("includes tokens and model on the llm_request span", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [
        baseTurn({
          model: "claude-opus-4-6",
          tokens: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 20,
          },
        }),
      ],
    })

    const llm = unwrap(otlpSpans(req)[1])

    expect(getAttr(llm.attributes, "model")).toBe("claude-opus-4-6")
    expect(getAttr(llm.attributes, "input_tokens")).toBe("100")
    expect(getAttr(llm.attributes, "output_tokens")).toBe("50")
    expect(getAttr(llm.attributes, "cache_read_tokens")).toBe("30")
    expect(getAttr(llm.attributes, "cache_creation_tokens")).toBe("20")
  })

  it("emits tool_execution spans parented to the llm_request span", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [
        baseTurn({
          toolCalls: [{ id: "tu_1", name: "Bash", input: { command: "ls" }, output: "ok" }],
        }),
      ],
    })

    const spans = otlpSpans(req)
    expect(spans).toHaveLength(3)
    const tool = unwrap(spans[2])

    expect(getAttr(tool.attributes, "span.type")).toBe("tool_execution")
    expect(getAttr(tool.attributes, "gen_ai.operation.name")).toBe("execute_tool")
    expect(getAttr(tool.attributes, "gen_ai.tool.name")).toBe("Bash")
    expect(getAttr(tool.attributes, "gen_ai.tool.call.id")).toBe("tu_1")
    expect(getAttr(tool.attributes, "gen_ai.tool.call.arguments")).toBe(JSON.stringify({ command: "ls" }))
    expect(getAttr(tool.attributes, "gen_ai.tool.call.result")).toBe("ok")
    // Tool is a sibling of the llm_request, parented to the interaction span.
    expect(tool.parentSpanId).toBe(unwrap(spans[0]).spanId)
    expect(tool.traceId).toBe(unwrap(spans[0]).traceId)
  })

  it("marks tool failures with error.type and status code 2", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [
        baseTurn({
          toolCalls: [{ id: "tu_err", name: "Bash", input: { command: "exit 1" }, output: "boom", isError: true }],
        }),
      ],
    })
    const tool = unwrap(otlpSpans(req)[2])
    expect(getAttr(tool.attributes, "error.type")).toBe("tool_error")
    expect(tool.status.code).toBe(2)
  })

  it("uses deterministic IDs so retries over the same (session, turn) collapse", () => {
    const a = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 3,
      turns: [baseTurn()],
    })
    const b = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 3,
      turns: [baseTurn()],
    })

    const aSpans = otlpSpans(a)
    const bSpans = otlpSpans(b)
    expect(unwrap(aSpans[0]).traceId).toBe(unwrap(bSpans[0]).traceId)
    expect(unwrap(aSpans[0]).spanId).toBe(unwrap(bSpans[0]).spanId)
  })

  it("includes full conversation history in llm_request input messages", () => {
    const history: Turn[] = [
      baseTurn({
        userText: "turn 1 user",
        assistantText: "turn 1 assistant",
        tokens: {},
        startMs: 0,
        endMs: 100,
      }),
      baseTurn({
        userText: "turn 2 user",
        assistantText: "turn 2 assistant",
        tokens: {},
        startMs: 200,
        endMs: 300,
      }),
    ]
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 3,
      turns: [baseTurn({ userText: "turn 3 user", assistantText: "turn 3 assistant" })],
      conversationHistory: history,
    })

    const llm = unwrap(otlpSpans(req)[1])
    const inputs = JSON.parse(unwrap(getAttr(llm.attributes, "gen_ai.input.messages")))
    expect(inputs).toEqual([
      { role: "user", parts: [{ type: "text", content: "turn 1 user" }] },
      { role: "assistant", parts: [{ type: "text", content: "turn 1 assistant" }] },
      { role: "user", parts: [{ type: "text", content: "turn 2 user" }] },
      { role: "assistant", parts: [{ type: "text", content: "turn 2 assistant" }] },
      { role: "user", parts: [{ type: "text", content: "turn 3 user" }] },
    ])

    // Interaction span stays narrow — just the current user prompt.
    const interaction = unwrap(otlpSpans(req)[0])
    const interactionInputs = JSON.parse(unwrap(getAttr(interaction.attributes, "gen_ai.input.messages")))
    expect(interactionInputs).toEqual([{ role: "user", parts: [{ type: "text", content: "turn 3 user" }] }])
  })

  it("accumulates prior new turns into the history for later turns in the same batch", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [
        baseTurn({ userText: "first user", assistantText: "first assistant" }),
        baseTurn({ userText: "second user", assistantText: "second assistant" }),
      ],
    })

    const spans = otlpSpans(req)
    // Two turns × (interaction + llm_request) = 4 spans.
    const secondLlm = unwrap(spans[3])
    const inputs = JSON.parse(unwrap(getAttr(secondLlm.attributes, "gen_ai.input.messages")))
    expect(inputs).toEqual([
      { role: "user", parts: [{ type: "text", content: "first user" }] },
      { role: "assistant", parts: [{ type: "text", content: "first assistant" }] },
      { role: "user", parts: [{ type: "text", content: "second user" }] },
    ])
  })

  it("gives subagent turns their own isolated history, not the parent session's", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [
        baseTurn({
          userText: "parent user",
          assistantText: "parent assistant",
          toolCalls: [
            {
              id: "toolu_agent_1",
              name: "Agent",
              input: { subagent_type: "Explore", description: "look" },
              output: "done",
              subagent: {
                agentId: "a1",
                agentType: "Explore",
                description: "look",
                turns: [
                  baseTurn({
                    userText: "sub turn 1 user",
                    assistantText: "sub turn 1 assistant",
                    model: "claude-haiku-4-5",
                    tokens: {},
                    startMs: 10,
                    endMs: 20,
                  }),
                  baseTurn({
                    userText: "sub turn 2 user",
                    assistantText: "sub turn 2 assistant",
                    model: "claude-haiku-4-5",
                    tokens: {},
                    startMs: 30,
                    endMs: 40,
                  }),
                ],
              },
            },
          ],
        }),
      ],
      conversationHistory: [
        baseTurn({
          userText: "a previous parent turn",
          assistantText: "a previous parent response",
          tokens: {},
          startMs: -100,
          endMs: -50,
        }),
      ],
    })

    const spans = otlpSpans(req)
    // Layout: 0 main interaction, 1 main llm_request, 2 Agent tool,
    //         3 sub1 interaction, 4 sub1 llm_request,
    //         5 sub2 interaction, 6 sub2 llm_request
    const sub2Llm = unwrap(spans[6])
    const inputs = JSON.parse(unwrap(getAttr(sub2Llm.attributes, "gen_ai.input.messages")))
    expect(inputs).toEqual([
      { role: "user", parts: [{ type: "text", content: "sub turn 1 user" }] },
      { role: "assistant", parts: [{ type: "text", content: "sub turn 1 assistant" }] },
      { role: "user", parts: [{ type: "text", content: "sub turn 2 user" }] },
    ])

    // First subagent turn has no history.
    const sub1Llm = unwrap(spans[4])
    const sub1Inputs = JSON.parse(unwrap(getAttr(sub1Llm.attributes, "gen_ai.input.messages")))
    expect(sub1Inputs).toEqual([{ role: "user", parts: [{ type: "text", content: "sub turn 1 user" }] }])
  })

  it("attaches latitude.tags and latitude.metadata to every span when context is provided", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [
        baseTurn({
          toolCalls: [{ id: "tu_1", name: "Bash", input: { command: "ls" }, output: "ok" }],
        }),
      ],
      context: {
        tags: ["latitude-v2"],
        metadata: {
          "workspace.name": "latitude-v2",
          "workspace.path": "/Users/x/src/latitude-v2",
          "git.branch": "main",
          "hook.event": "Stop",
        },
      },
    })

    const spans = otlpSpans(req)
    expect(spans).toHaveLength(3)
    for (const span of spans) {
      const tags = getAttr(span.attributes, "latitude.tags")
      const metadata = getAttr(span.attributes, "latitude.metadata")
      expect(JSON.parse(unwrap(tags))).toEqual(["latitude-v2"])
      expect(JSON.parse(unwrap(metadata))).toEqual({
        "workspace.name": "latitude-v2",
        "workspace.path": "/Users/x/src/latitude-v2",
        "git.branch": "main",
        "hook.event": "Stop",
      })
    }
  })

  it("omits latitude.tags and latitude.metadata when context is empty", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [baseTurn()],
      context: { tags: [], metadata: {} },
    })

    const spans = otlpSpans(req)
    for (const span of spans) {
      expect(getAttr(span.attributes, "latitude.tags")).toBeUndefined()
      expect(getAttr(span.attributes, "latitude.metadata")).toBeUndefined()
    }
  })

  it("emits one llm_request per AssistantCall with tools as siblings under the interaction", () => {
    // A tool-loop turn: call A → tool A → call B → tool B → call C (final text).
    // We emit one llm_request per model call and parent every tool_execution span
    // to the interaction span (as a sibling of the llm_requests), not to the
    // llm_request that emitted the tool. The model finishes generating BEFORE the
    // tool runs, so sibling ordering reads the timeline correctly in the UI:
    // llm_request → tool → llm_request → tool → llm_request.
    const turn: Turn = {
      userText: "run then echo",
      startMs: 1_000,
      endMs: 1_600,
      calls: [
        {
          messageId: "msg_a",
          model: "claude-sonnet-4-6",
          text: "",
          toolUses: [
            {
              id: "tu_1",
              name: "Bash",
              input: { command: "ls" },
              output: "file1",
              startMs: 1_050,
              endMs: 1_100,
            },
          ],
          tokens: { input_tokens: 100, output_tokens: 20 },
          startMs: 1_000,
          endMs: 1_050,
        },
        {
          messageId: "msg_b",
          model: "claude-sonnet-4-6",
          text: "",
          toolUses: [
            {
              id: "tu_2",
              name: "Bash",
              input: { command: "echo hi" },
              output: "hi",
              startMs: 1_250,
              endMs: 1_300,
            },
          ],
          tokens: { input_tokens: 200, output_tokens: 10 },
          startMs: 1_200,
          endMs: 1_250,
        },
        {
          messageId: "msg_c",
          model: "claude-sonnet-4-6",
          text: "done",
          toolUses: [],
          tokens: { input_tokens: 300, output_tokens: 5 },
          startMs: 1_400,
          endMs: 1_500,
        },
      ],
    }

    const req = buildOtlpRequest({ sessionId: "sess-1", turnStartNumber: 1, turns: [turn] })
    const spans = otlpSpans(req)

    // Expected: interaction + 3 llm_requests + 2 tools = 6 spans.
    expect(spans).toHaveLength(6)

    const interaction = unwrap(spans[0])
    const llm1 = unwrap(spans[1])
    const tool1 = unwrap(spans[2])
    const llm2 = unwrap(spans[3])
    const tool2 = unwrap(spans[4])
    const llm3 = unwrap(spans[5])

    // All llm_requests are siblings under the interaction.
    expect(llm1.parentSpanId).toBe(interaction.spanId)
    expect(llm2.parentSpanId).toBe(interaction.spanId)
    expect(llm3.parentSpanId).toBe(interaction.spanId)

    // Tools are siblings of the llm_requests, all parented to the interaction.
    // The tool runs AFTER the model finishes generating, not inside the generation.
    expect(tool1.parentSpanId).toBe(interaction.spanId)
    expect(tool2.parentSpanId).toBe(interaction.spanId)

    // Per-call tokens are NOT summed — each span reports its own usage.
    expect(getAttr(llm1.attributes, "input_tokens")).toBe("100")
    expect(getAttr(llm2.attributes, "input_tokens")).toBe("200")
    expect(getAttr(llm3.attributes, "input_tokens")).toBe("300")

    // Call index is exposed so the UI can order calls within a turn.
    expect(getAttr(llm1.attributes, "llm_request.call_index")).toBe("0")
    expect(getAttr(llm2.attributes, "llm_request.call_index")).toBe("1")
    expect(getAttr(llm3.attributes, "llm_request.call_index")).toBe("2")

    // Call 1 output embeds the tool_call inside the assistant message.
    const out1 = JSON.parse(unwrap(getAttr(llm1.attributes, "gen_ai.output.messages")))
    expect(out1).toEqual([
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "tu_1", name: "Bash", arguments: { command: "ls" } }],
      },
    ])

    // Call 2 input carries the FULL conversation accumulated up to that point: the
    // user prompt, call 1's assistant message (with tool_call), and call 1's tool
    // response. This mirrors what actually hit the model API.
    const in2 = JSON.parse(unwrap(getAttr(llm2.attributes, "gen_ai.input.messages")))
    expect(in2).toEqual([
      { role: "user", parts: [{ type: "text", content: "run then echo" }] },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "tu_1", name: "Bash", arguments: { command: "ls" } }],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "tu_1", response: "file1" }] },
    ])

    // Call 3 input accumulates everything call 2 saw PLUS call 2's output and tool response.
    const in3 = JSON.parse(unwrap(getAttr(llm3.attributes, "gen_ai.input.messages")))
    expect(in3).toEqual([
      { role: "user", parts: [{ type: "text", content: "run then echo" }] },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "tu_1", name: "Bash", arguments: { command: "ls" } }],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "tu_1", response: "file1" }] },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "tu_2", name: "Bash", arguments: { command: "echo hi" } }],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "tu_2", response: "hi" }] },
    ])

    // Call 3 has no tool calls — output is just the final text.
    const out3 = JSON.parse(unwrap(getAttr(llm3.attributes, "gen_ai.output.messages")))
    expect(out3).toEqual([{ role: "assistant", parts: [{ type: "text", content: "done" }] }])

    // Tool spans carry per-call timing from their tool_use → tool_result timestamps.
    const toNs = (ms: number) => (BigInt(ms) * 1_000_000n).toString()
    expect(tool1.startTimeUnixNano).toBe(toNs(1_050))
    expect(tool1.endTimeUnixNano).toBe(toNs(1_100))
  })

  it("enriches llm_request with captured system prompt, tool definitions, and real messages when available", () => {
    const turn = baseTurn({ messageId: "msg_real", userText: "ping", assistantText: "pong" })

    const captured: StoredRequest = {
      messageId: "msg_real",
      capturedAt: "2026-04-20T12:00:00.000Z",
      url: "https://api.anthropic.com/v1/messages",
      request: {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 32000,
        temperature: 0.2,
        stream: true,
        system: [
          { type: "text", text: "You are Claude Code." },
          { type: "text", text: "CLAUDE.md says: be brief." },
        ],
        tools: [
          { name: "Bash", description: "Run a shell command", input_schema: { type: "object" } },
          { name: "Read", description: "Read a file", input_schema: { type: "object" } },
        ],
        messages: [
          { role: "user", content: "ping" },
          {
            role: "assistant",
            content: [
              { type: "text", text: "thinking..." },
              { type: "tool_use", id: "tu_x", name: "Read", input: { path: "/tmp/x" } },
            ],
          },
          {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "tu_x", content: "file contents" }],
          },
        ],
      },
    }
    const requestsByMessageId = new Map<string, StoredRequest>([["msg_real", captured]])

    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [turn],
      requestsByMessageId,
    })
    const llm = unwrap(otlpSpans(req)[1])

    // Marker that this span was enriched from a captured request.
    expect(getAttr(llm.attributes, "llm_request.captured")).toBeDefined()

    // System prompt materialized as the canonical gen_ai.system_instructions shape.
    const sys = JSON.parse(unwrap(getAttr(llm.attributes, "gen_ai.system_instructions")))
    expect(sys).toEqual([
      { type: "text", content: "You are Claude Code." },
      { type: "text", content: "CLAUDE.md says: be brief." },
    ])

    // Tool definitions stored verbatim from the request.
    const tools = JSON.parse(unwrap(getAttr(llm.attributes, "gen_ai.tool.definitions")))
    expect(tools).toHaveLength(2)
    expect(tools[0].name).toBe("Bash")

    // Request parameters.
    expect(getAttr(llm.attributes, "gen_ai.request.model")).toBe("claude-sonnet-4-5-20250929")
    expect(getAttr(llm.attributes, "gen_ai.request.max_tokens")).toBe("32000")
    expect(getAttr(llm.attributes, "gen_ai.request.temperature")).toBe("0.2")

    // Input messages come from the captured request, including the tool_use and
    // tool_result blocks split into assistant + role:tool messages per Latitude's format.
    const inputs = JSON.parse(unwrap(getAttr(llm.attributes, "gen_ai.input.messages")))
    expect(inputs).toEqual([
      { role: "user", parts: [{ type: "text", content: "ping" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", content: "thinking..." },
          { type: "tool_call", id: "tu_x", name: "Read", arguments: { path: "/tmp/x" } },
        ],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "tu_x", response: "file contents" }] },
    ])
  })

  it("falls back to reconstructed messages when no captured request matches the call", () => {
    // Empty map — simulates the preload not being installed. The span must still work
    // and the reconstruction path from prior commits must kick in.
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [baseTurn({ userText: "hello", assistantText: "hi" })],
      requestsByMessageId: new Map(),
    })
    const llm = unwrap(otlpSpans(req)[1])
    expect(getAttr(llm.attributes, "llm_request.captured")).toBeUndefined()
    expect(getAttr(llm.attributes, "gen_ai.system_instructions")).toBeUndefined()
    expect(getAttr(llm.attributes, "gen_ai.tool.definitions")).toBeUndefined()
    const inputs = JSON.parse(unwrap(getAttr(llm.attributes, "gen_ai.input.messages")))
    expect(inputs).toEqual([{ role: "user", parts: [{ type: "text", content: "hello" }] }])
  })

  it("nests subagent interaction+llm_request+tool spans under the parent Agent tool span", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [
        baseTurn({
          model: "claude-opus-4-7",
          tokens: { input_tokens: 200, output_tokens: 30 },
          toolCalls: [
            {
              id: "toolu_agent_1",
              name: "Agent",
              input: { subagent_type: "Explore", description: "find X" },
              output: "found X",
              subagent: {
                agentId: "a4dabb47",
                agentType: "Explore",
                description: "find X",
                turns: [
                  baseTurn({
                    userText: "find X in repo",
                    assistantText: "X is at foo.ts",
                    model: "claude-haiku-4-5",
                    tokens: { input_tokens: 500, output_tokens: 40 },
                    toolCalls: [{ id: "toolu_grep_1", name: "Grep", input: { pattern: "X" }, output: "match" }],
                    startMs: 1_100,
                    endMs: 1_900,
                  }),
                ],
              },
            },
          ],
        }),
      ],
    })

    const spans = otlpSpans(req)

    // Expected shape:
    // 0 main interaction
    // 1 main llm_request
    // 2 Agent tool_execution (with subagent meta)
    // 3 subagent_interaction (parent = Agent tool)
    // 4 subagent llm_request
    // 5 subagent Grep tool_execution
    expect(spans).toHaveLength(6)

    const mainInteraction = unwrap(spans[0])
    const agentTool = unwrap(spans[2])
    const subInteraction = unwrap(spans[3])
    const subLlm = unwrap(spans[4])
    const subTool = unwrap(spans[5])

    expect(getAttr(agentTool.attributes, "span.type")).toBe("tool_execution")
    expect(getAttr(agentTool.attributes, "gen_ai.tool.name")).toBe("Agent")
    expect(getAttr(agentTool.attributes, "subagent.type")).toBe("Explore")
    expect(getAttr(agentTool.attributes, "subagent.name")).toBe("Explore")
    expect(getAttr(agentTool.attributes, "subagent.turn_count")).toBe("1")
    // Tool is a sibling of the llm_request that emitted it, parented to the interaction.
    expect(agentTool.parentSpanId).toBe(mainInteraction.spanId)

    expect(getAttr(subInteraction.attributes, "span.type")).toBe("interaction")
    expect(getAttr(subInteraction.attributes, "interaction.kind")).toBe("subagent")
    expect(getAttr(subInteraction.attributes, "subagent.id")).toBe("Explore:a4dabb47")
    expect(getAttr(subInteraction.attributes, "subagent.name")).toBe("Explore")
    expect(subInteraction.parentSpanId).toBe(agentTool.spanId)
    expect(subInteraction.traceId).toBe(mainInteraction.traceId)

    expect(getAttr(subLlm.attributes, "span.type")).toBe("llm_request")
    expect(getAttr(subLlm.attributes, "model")).toBe("claude-haiku-4-5")
    expect(getAttr(subLlm.attributes, "subagent.name")).toBe("Explore")
    expect(getAttr(subLlm.attributes, "input_tokens")).toBe("500")
    expect(subLlm.parentSpanId).toBe(subInteraction.spanId)

    expect(getAttr(subTool.attributes, "span.type")).toBe("tool_execution")
    expect(getAttr(subTool.attributes, "gen_ai.tool.name")).toBe("Grep")
    // Subagent tool is a sibling of the subagent llm_request, parented to the
    // subagent interaction span (same sibling rule applied recursively).
    expect(subTool.parentSpanId).toBe(subInteraction.spanId)
  })
})

describe("span size capping", () => {
  it("leaves spans under the budget untouched", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-cap",
      turnStartNumber: 1,
      turns: [baseTurn({ assistantText: "normal sized response" })],
    })
    for (const span of otlpSpans(req)) {
      expect(getAttr(span.attributes, "latitude.truncation")).toBeUndefined()
    }
  })

  it("clamps giant tool results and keeps the span bounded", () => {
    const giant = "x".repeat(500_000)
    const req = buildOtlpRequest({
      sessionId: "sess-cap",
      turnStartNumber: 1,
      turns: [
        baseTurn({
          toolCalls: [{ id: "tool_1", name: "Bash", input: { command: "cat big.log" }, output: giant }],
        }),
      ],
    })
    const toolSpan = unwrap(otlpSpans(req).find((s) => s.name === "tool:Bash"))
    const result = unwrap(getAttr(toolSpan.attributes, "gen_ai.tool.call.result"))
    expect(result.length).toBeLessThan(150_000)
    expect(result).toContain("[latitude: truncated")
    expect(getAttr(toolSpan.attributes, "latitude.truncation")).toContain("tool result clamped")
    expect(JSON.stringify(toolSpan).length).toBeLessThan(200_000)
  })

  it("drops oldest input messages on oversized llm_request spans, keeping valid JSON", () => {
    const history: Turn[] = Array.from({ length: 50 }, (_, i) =>
      baseTurn({
        userText: `prompt ${i} ${"h".repeat(10_000)}`,
        assistantText: `answer ${i} ${"a".repeat(10_000)}`,
        messageId: `msg_h${i}`,
      }),
    )
    const req = buildOtlpRequest({
      sessionId: "sess-cap",
      turnStartNumber: 51,
      turns: [baseTurn({ userText: "latest question", assistantText: "latest answer", messageId: "msg_new" })],
      conversationHistory: history,
    })
    const llm = unwrap(otlpSpans(req).find((s) => s.name === "llm_request"))
    const inputJson = unwrap(getAttr(llm.attributes, "gen_ai.input.messages"))
    expect(inputJson.length).toBeLessThanOrEqual(64 * 1024)
    const messages = JSON.parse(inputJson) as Array<{ role: string; parts: Array<{ content?: string }> }>
    // The tail (current prompt) survives; the oldest history is what gets dropped.
    const last = unwrap(messages[messages.length - 1])
    expect(JSON.stringify(last)).toContain("latest question")
    expect(getAttr(llm.attributes, "latitude.truncation")).toContain("dropped")
    expect(JSON.stringify(llm).length).toBeLessThan(256 * 1024)
  })

  it("strips orphan tool responses when an oversized tool message alone survives truncation", () => {
    const giantOutput = "x".repeat(50_000)
    const history: Turn[] = Array.from({ length: 5 }, (_, i) =>
      baseTurn({
        userText: `question ${i} ${"h".repeat(15_000)}`,
        assistantText: `answer ${i} ${"a".repeat(15_000)}`,
        messageId: `msg_h${i}`,
      }),
    )
    const req = buildOtlpRequest({
      sessionId: "sess-cap",
      turnStartNumber: 6,
      turns: [
        baseTurn({
          userText: "read screenshots",
          calls: [
            {
              messageId: "msg_tools",
              model: "claude-opus-4-8",
              text: "",
              toolUses: [
                {
                  id: "toolu_orphan1",
                  name: "Read",
                  input: { path: "/a.png" },
                  output: giantOutput,
                  startMs: 1_000,
                  endMs: 2_000,
                },
                {
                  id: "toolu_orphan2",
                  name: "Read",
                  input: { path: "/b.png" },
                  output: giantOutput,
                  startMs: 1_000,
                  endMs: 2_000,
                },
              ],
              tokens: { input_tokens: 100, output_tokens: 50 },
              startMs: 1_000,
              endMs: 2_000,
            },
            {
              messageId: "msg_final",
              model: "claude-opus-4-8",
              text: "I see the screenshots",
              toolUses: [],
              tokens: { input_tokens: 100, output_tokens: 50 },
              startMs: 2_000,
              endMs: 3_000,
            },
          ],
        }),
      ],
      conversationHistory: history,
    })
    const llmSpans = otlpSpans(req).filter((s) => s.name === "llm_request")
    const followUpLlm = unwrap(llmSpans[llmSpans.length - 1])
    const inputJson = unwrap(getAttr(followUpLlm.attributes, "gen_ai.input.messages"))
    expect(inputJson.length).toBeLessThanOrEqual(64 * 1024)
    const messages = JSON.parse(inputJson) as Array<{
      role: string
      parts: Array<{ type: string; id?: string }>
    }>
    const toolCallIds = new Set<string>()
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "tool_call" && part.id) toolCallIds.add(part.id)
        if (part.type === "tool_call_response" && part.id) {
          expect(toolCallIds.has(part.id)).toBe(true)
        }
      }
    }
    expect(getAttr(followUpLlm.attributes, "latitude.truncation")).toContain("stripped orphan tool responses")
  })

  it("returns an empty message array when a lone oversized tool message is the only survivor", () => {
    const giantOutput = "x".repeat(200_000)
    const req = buildOtlpRequest({
      sessionId: "sess-cap",
      turnStartNumber: 1,
      turns: [
        baseTurn({
          userText: "read file",
          calls: [
            {
              messageId: "msg_tools",
              model: "claude-opus-4-8",
              text: "",
              toolUses: [
                {
                  id: "toolu_only",
                  name: "Read",
                  input: { path: "/big.png" },
                  output: giantOutput,
                  startMs: 1_000,
                  endMs: 2_000,
                },
              ],
              tokens: { input_tokens: 100, output_tokens: 50 },
              startMs: 1_000,
              endMs: 2_000,
            },
            {
              messageId: "msg_final",
              model: "claude-opus-4-8",
              text: "done",
              toolUses: [],
              tokens: { input_tokens: 100, output_tokens: 50 },
              startMs: 2_000,
              endMs: 3_000,
            },
          ],
        }),
      ],
    })
    const llmSpans = otlpSpans(req).filter((s) => s.name === "llm_request")
    const followUpLlm = unwrap(llmSpans[llmSpans.length - 1])
    const inputJson = unwrap(getAttr(followUpLlm.attributes, "gen_ai.input.messages"))
    const truncation = unwrap(getAttr(followUpLlm.attributes, "latitude.truncation"))
    expect(truncation).toContain("stripped orphan tool responses")
    expect(inputJson).toBe("[]")
  })

  it("clamps oversized user prompts on the interaction span", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-cap",
      turnStartNumber: 1,
      turns: [baseTurn({ userText: "p".repeat(200_000) })],
    })
    const interaction = unwrap(otlpSpans(req).find((s) => s.name === "interaction"))
    const prompt = unwrap(getAttr(interaction.attributes, "user_prompt"))
    expect(prompt.length).toBeLessThan(70_000)
    // The original length is preserved for analytics even when the text is clamped.
    expect(getAttr(interaction.attributes, "user_prompt_length")).toBe("200000")
    expect(getAttr(interaction.attributes, "latitude.truncation")).toBe("user prompt clamped")
  })

  it("preserves every tool name when tool-definition schemas exceed the byte budget", () => {
    const fatDescription = "d".repeat(8_000)
    const toolNames = ["Agent", "Artifact", "Bash", "Read", "ToolSearch", "WebFetch", "WebSearch"]
    const tools = toolNames.map((name) => ({
      name,
      description: fatDescription,
      input_schema: { type: "object", properties: { q: { type: "string" } } },
    }))
    // Captured payloads replace reconstruction — oversize the captured request to hit the budget.
    const captured: StoredRequest = {
      messageId: "msg_tools_cap",
      capturedAt: "2026-07-21T12:00:00.000Z",
      url: "https://api.anthropic.com/v1/messages",
      request: {
        model: "claude-opus-4-8",
        max_tokens: 32000,
        system: [{ type: "text", text: "s".repeat(80_000) }],
        tools,
        messages: Array.from({ length: 20 }, (_, i) => ({
          role: "user" as const,
          content: `prompt ${i} ${"h".repeat(4_000)}`,
        })),
      },
    }
    const req = buildOtlpRequest({
      sessionId: "sess-cap",
      turnStartNumber: 1,
      turns: [
        baseTurn({
          messageId: "msg_tools_cap",
          userText: "search the web",
          toolCalls: [
            {
              id: "toolu_web",
              name: "WebSearch",
              input: { query: "AI agents" },
              output: "results",
            },
          ],
        }),
      ],
      requestsByMessageId: new Map([["msg_tools_cap", captured]]),
    })
    const llm = unwrap(otlpSpans(req).find((s) => s.name === "llm_request"))
    const truncation = unwrap(getAttr(llm.attributes, "latitude.truncation"))
    expect(truncation).toContain("tool definitions:")
    expect(truncation).toMatch(/name-only|names/)
    const defs = JSON.parse(unwrap(getAttr(llm.attributes, "gen_ai.tool.definitions"))) as Array<{ name: string }>
    expect(defs.map((d) => d.name)).toEqual(toolNames)
    expect(JSON.stringify(defs).length).toBeLessThanOrEqual(16 * 1024)
  })
})

describe("redaction", () => {
  it("redacts matching attributes before export", () => {
    const req = buildOtlpRequest({
      sessionId: "sess-redact",
      turnStartNumber: 1,
      turns: [baseTurn({ userText: "secret prompt", assistantText: "secret output" })],
      redact: { attributes: ["/^gen_ai\\.(input|output)\\.messages$/", "user_prompt"], mask: "[]" },
    })
    const spans = otlpSpans(req)
    const interaction = unwrap(spans.find((span) => span.name === "interaction"))
    const llm = unwrap(spans.find((span) => span.name === "llm_request"))

    expect(getAttr(interaction.attributes, "user_prompt")).toBe("[]")
    expect(getAttr(interaction.attributes, "gen_ai.input.messages")).toBe("[]")
    expect(getAttr(llm.attributes, "gen_ai.input.messages")).toBe("[]")
    expect(getAttr(llm.attributes, "gen_ai.output.messages")).toBe("[]")
  })
})

describe("chunkOtlpRequest", () => {
  it("returns the original request when it fits the budget", () => {
    const req = buildOtlpRequest({ sessionId: "sess-chunk", turnStartNumber: 1, turns: [baseTurn()] })
    const chunks = chunkOtlpRequest(req)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(req)
  })

  it("splits oversized batches preserving every span, order, and the envelope", () => {
    const turns = Array.from({ length: 10 }, (_, i) =>
      baseTurn({
        userText: `turn ${i}`,
        assistantText: "b".repeat(30_000),
        messageId: `msg_c${i}`,
      }),
    )
    const req = buildOtlpRequest({ sessionId: "sess-chunk", turnStartNumber: 1, turns })
    const all = otlpSpans(req)
    const chunks = chunkOtlpRequest(req, 100_000)
    expect(chunks.length).toBeGreaterThan(1)

    const reassembled = chunks.flatMap((c) => otlpSpans(c))
    expect(reassembled.map((s) => s.spanId)).toEqual(all.map((s) => s.spanId))
    for (const chunk of chunks) {
      // Multi-span chunks respect the budget; a lone span bigger than the budget
      // still ships (in its own chunk) rather than being dropped.
      if (otlpSpans(chunk).length > 1) {
        expect(JSON.stringify(chunk).length).toBeLessThanOrEqual(100_000)
      }
      const rs = unwrap(chunk.resourceSpans[0])
      expect(rs.resource).toEqual(unwrap(req.resourceSpans[0]).resource)
      expect(unwrap(rs.scopeSpans[0]).scope).toEqual(unwrap(unwrap(req.resourceSpans[0]).scopeSpans[0]).scope)
    }
  })

  it("gives a span larger than the budget its own chunk instead of dropping it", () => {
    const turns = [
      baseTurn({ userText: "small", messageId: "msg_s" }),
      baseTurn({ userText: "big", assistantText: "z".repeat(50_000), messageId: "msg_b" }),
    ]
    const req = buildOtlpRequest({ sessionId: "sess-chunk", turnStartNumber: 1, turns })
    const all = otlpSpans(req)
    const chunks = chunkOtlpRequest(req, 10_000)
    const reassembled = chunks.flatMap((c) => otlpSpans(c))
    expect(reassembled.map((s) => s.spanId)).toEqual(all.map((s) => s.spanId))
  })
})

describe("agent link capture", () => {
  it("captures a distinct link per parallel Agent tool call", () => {
    const agentLinks: AgentSpanLink[] = []
    buildOtlpRequest({
      sessionId: "sess-1",
      turnStartNumber: 1,
      turns: [
        baseTurn({
          calls: [
            {
              messageId: "a1",
              model: "claude-opus-4-7",
              text: "spawning",
              tokens: {},
              startMs: 1_000,
              endMs: 1_100,
              toolUses: [
                { id: "toolu_1", name: "Agent", input: {}, promptId: "p-shared", startMs: 1_100, endMs: 1_200 },
                { id: "toolu_2", name: "Agent", input: {}, promptId: "p-shared", startMs: 1_100, endMs: 1_200 },
              ],
            },
          ],
        }),
      ],
      agentLinks,
    })

    expect(agentLinks.map((l) => l.toolUseId)).toEqual(["toolu_1", "toolu_2"])
    // Parallel calls share a promptId but get distinct parent span ids.
    expect(agentLinks[0]?.parentSpanId).not.toBe(agentLinks[1]?.parentSpanId)
    expect(new Set(agentLinks.map((l) => l.traceId)).size).toBe(1)
  })
})

describe("buildSubagentSpans", () => {
  const grepCall: AssistantCall = {
    messageId: "s1",
    model: "claude-haiku-4-5",
    text: "searching",
    tokens: { input_tokens: 100, output_tokens: 10 },
    startMs: 1_100,
    endMs: 1_150,
    toolUses: [
      { id: "toolu_grep", name: "Grep", input: { pattern: "X" }, output: "match", startMs: 1_150, endMs: 1_200 },
    ],
  }
  const synthesisCall: AssistantCall = {
    messageId: "s2",
    model: "claude-haiku-4-5",
    text: "the answer is foo.ts",
    tokens: { input_tokens: 300, output_tokens: 40 },
    startMs: 1_300,
    endMs: 1_400,
    toolUses: [],
  }
  const subagentOf = (calls: AssistantCall[], endMs: number): SubagentInvocation => ({
    agentId: "a4dabb47",
    agentType: "Explore",
    description: "find X",
    turns: [{ userText: "find X", calls, startMs: 1_000, endMs }],
  })

  it("emits the subtree under the given trace and parent span", () => {
    const spans = buildSubagentSpans({
      sessionId: "sess-1",
      traceId: "trace-abc",
      parentSpanId: "parent-tool-span",
      subagent: subagentOf([grepCall], 1_200),
    })

    const interaction = unwrap(spans.find((s) => getAttr(s.attributes, "span.type") === "interaction"))
    const llm = unwrap(spans.find((s) => getAttr(s.attributes, "span.type") === "llm_request"))
    const tool = unwrap(spans.find((s) => getAttr(s.attributes, "span.type") === "tool_execution"))

    expect(spans.every((s) => s.traceId === "trace-abc")).toBe(true)
    expect(interaction.parentSpanId).toBe("parent-tool-span")
    expect(getAttr(interaction.attributes, "subagent.id")).toBe("Explore:a4dabb47")
    expect(getAttr(interaction.attributes, "subagent.name")).toBe("Explore")
    expect(llm.parentSpanId).toBe(interaction.spanId)
    expect(tool.parentSpanId).toBe(interaction.spanId)
  })

  it("emits only the windowed calls, and the interaction only when asked", () => {
    // Second Stop: first call already emitted, interaction already emitted; only the
    // now-settled trailing (synthesis) call should go out.
    const trailingOnly = buildSubagentSpans({
      sessionId: "sess-1",
      traceId: "trace-abc",
      parentSpanId: "parent-tool-span",
      subagent: subagentOf([grepCall, synthesisCall], 1_400),
      emitInteraction: false,
      fromCall: 1,
      toCall: 2,
    })

    expect(trailingOnly.some((s) => getAttr(s.attributes, "span.type") === "interaction")).toBe(false)
    const llms = trailingOnly.filter((s) => getAttr(s.attributes, "span.type") === "llm_request")
    expect(llms).toHaveLength(1)
    expect(getAttr(unwrap(llms[0]).attributes, "llm_request.message_id")).toBe("s2")
  })

  it("emits each span exactly once as the transcript grows (no double-count)", () => {
    // Full subtree for reference — this is what a single complete emission produces.
    const full = buildSubagentSpans({
      sessionId: "sess-1",
      traceId: "trace-abc",
      parentSpanId: "parent-tool-span",
      subagent: subagentOf([grepCall, synthesisCall], 1_400),
    })

    // Stop 1 (still growing): interaction + closed calls [0,1). Stop 2 (stable): the
    // trailing call [1,2), no interaction.
    const stop1 = buildSubagentSpans({
      sessionId: "sess-1",
      traceId: "trace-abc",
      parentSpanId: "parent-tool-span",
      subagent: subagentOf([grepCall], 1_200),
      emitInteraction: true,
      fromCall: 0,
      toCall: 1,
    })
    const stop2 = buildSubagentSpans({
      sessionId: "sess-1",
      traceId: "trace-abc",
      parentSpanId: "parent-tool-span",
      subagent: subagentOf([grepCall, synthesisCall], 1_400),
      emitInteraction: false,
      fromCall: 1,
      toCall: 2,
    })

    const ids1 = stop1.map((s) => s.spanId)
    const ids2 = stop2.map((s) => s.spanId)
    // No span id is sent twice — the additive traces aggregate can't double-count.
    expect(ids1.filter((id) => ids2.includes(id))).toEqual([])
    // Together the two passes cover exactly the full subtree, once each.
    expect([...ids1, ...ids2].sort()).toEqual(full.map((s) => s.spanId).sort())
    // Start times match the reference emission (stable ReplacingMergeTree sort key).
    const fullStart = new Map(full.map((s) => [s.spanId, s.startTimeUnixNano]))
    for (const s of [...stop1, ...stop2]) {
      expect(s.startTimeUnixNano).toBe(fullStart.get(s.spanId))
    }
  })
})

describe("memory operation child spans", () => {
  const ROOT = "/home/u/.claude/projects"
  const MEM = `${ROOT}/-proj/memory`
  const MEM_OPS = ["upsert_memory", "update_memory", "search_memory"]

  function memory(overrides: Partial<MemoryEmitOptions> = {}): MemoryEmitOptions {
    return { projectsRoot: ROOT, captureContent: true, readFile: () => "disk body", ...overrides }
  }

  function build(
    toolCalls: (Partial<ToolCall> & Pick<ToolCall, "id" | "name" | "input">)[],
    mem: MemoryEmitOptions | undefined,
  ) {
    return otlpSpans(
      buildOtlpRequest({ sessionId: "s1", turnStartNumber: 1, turns: [baseTurn({ toolCalls })], memory: mem }),
    )
  }

  it("emits an upsert_memory child under a Write to the memory dir", () => {
    const spans = build(
      [
        {
          id: "tu1",
          name: "Write",
          input: { file_path: `${MEM}/MEMORY.md`, content: "hello" },
          output: "File created",
        },
      ],
      memory(),
    )
    const toolSpan = unwrap(spans.find((s) => s.name === "tool:Write"))
    const mem = unwrap(spans.find((s) => s.name === "upsert_memory"))
    expect(mem.parentSpanId).toBe(toolSpan.spanId)
    expect(mem.kind).toBe(3)
    expect(getAttr(mem.attributes, "gen_ai.memory.store.id")).toBe("-proj")
    expect(getAttr(mem.attributes, "gen_ai.memory.record.id")).toBe("MEMORY.md")
    expect(getAttr(mem.attributes, "gen_ai.memory.record.count")).toBe("1")
    expect(JSON.parse(unwrap(getAttr(mem.attributes, "gen_ai.memory.records")))).toEqual([
      { id: "MEMORY.md", content: "hello" },
    ])
  })

  it("emits update_memory carrying the disk body for an Edit", () => {
    const spans = build(
      [{ id: "tu1", name: "Edit", input: { file_path: `${MEM}/topic.md`, old_string: "a", new_string: "b" } }],
      memory(),
    )
    const mem = unwrap(spans.find((s) => s.name === "update_memory"))
    expect(JSON.parse(unwrap(getAttr(mem.attributes, "gen_ai.memory.records")))).toEqual([
      { id: "topic.md", content: "disk body" },
    ])
  })

  it("emits search_memory for a Read", () => {
    const spans = build(
      [{ id: "tu1", name: "Read", input: { file_path: `${MEM}/topic.md` }, output: "1\thi" }],
      memory(),
    )
    expect(spans.some((s) => s.name === "search_memory")).toBe(true)
  })

  it("ignores files outside the projects root", () => {
    const spans = build(
      [{ id: "tu1", name: "Write", input: { file_path: "/home/u/repo/a.ts", content: "x" } }],
      memory(),
    )
    expect(spans.some((s) => MEM_OPS.includes(s.name))).toBe(false)
  })

  it("emits the child span for a store under a different slug than the session (git worktree)", () => {
    const spans = build(
      [{ id: "tu1", name: "Write", input: { file_path: `${ROOT}/-main-worktree/memory/x.md`, content: "hi" } }],
      memory(),
    )
    const toolSpan = unwrap(spans.find((s) => s.name === "tool:Write"))
    const mem = unwrap(spans.find((s) => s.name === "upsert_memory"))
    expect(mem.parentSpanId).toBe(toolSpan.spanId)
    expect(getAttr(mem.attributes, "gen_ai.memory.store.id")).toBe("-main-worktree")
    expect(getAttr(mem.attributes, "gen_ai.memory.record.id")).toBe("x.md")
  })

  it("emits structure only when captureContent is off", () => {
    const spans = build(
      [{ id: "tu1", name: "Write", input: { file_path: `${MEM}/x.md`, content: "hi" } }],
      memory({ captureContent: false }),
    )
    const mem = unwrap(spans.find((s) => s.name === "upsert_memory"))
    expect(getAttr(mem.attributes, "gen_ai.memory.record.id")).toBe("x.md")
    expect(getAttr(mem.attributes, "gen_ai.memory.records")).toBeUndefined()
  })

  it("skips the memory span when the tool call errored", () => {
    const spans = build(
      [
        {
          id: "tu1",
          name: "Edit",
          input: { file_path: `${MEM}/x.md`, old_string: "a", new_string: "b" },
          isError: true,
        },
      ],
      memory(),
    )
    expect(spans.some((s) => s.name === "update_memory")).toBe(false)
  })

  it("emits no memory spans when memory is not configured", () => {
    const spans = build([{ id: "tu1", name: "Write", input: { file_path: `${MEM}/x.md`, content: "hi" } }], undefined)
    expect(spans.some((s) => MEM_OPS.includes(s.name))).toBe(false)
  })

  it("keeps gen_ai.memory.records valid JSON when a huge body is capped", () => {
    const huge = "x".repeat(200_000)
    const spans = build([{ id: "tu1", name: "Write", input: { file_path: `${MEM}/big.md`, content: huge } }], memory())
    const mem = unwrap(spans.find((s) => s.name === "upsert_memory"))
    const raw = unwrap(getAttr(mem.attributes, "gen_ai.memory.records"))
    const parsed = JSON.parse(raw) as Array<{ id: string; content: string }>
    expect(parsed[0]?.id).toBe("big.md")
    expect(parsed[0]?.content).toContain("[latitude: truncated")
    expect(parsed[0]?.content.length).toBeLessThan(huge.length)
  })
})
