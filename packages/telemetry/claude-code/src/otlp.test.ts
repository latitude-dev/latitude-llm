import { describe, expect, it } from "vitest"
import { buildOtlpRequest } from "./otlp.ts"
import type { StoredRequest } from "./request-store.ts"
import type { AssistantCall, OtlpKeyValue, ToolCall, Turn, Usage } from "./types.ts"

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
    expect(getAttr(agentTool.attributes, "subagent.turn_count")).toBe("1")
    // Tool is a sibling of the llm_request that emitted it, parented to the interaction.
    expect(agentTool.parentSpanId).toBe(mainInteraction.spanId)

    expect(getAttr(subInteraction.attributes, "span.type")).toBe("interaction")
    expect(getAttr(subInteraction.attributes, "interaction.kind")).toBe("subagent")
    expect(getAttr(subInteraction.attributes, "subagent.id")).toBe("Explore:a4dabb47")
    expect(subInteraction.parentSpanId).toBe(agentTool.spanId)
    expect(subInteraction.traceId).toBe(mainInteraction.traceId)

    expect(getAttr(subLlm.attributes, "span.type")).toBe("llm_request")
    expect(getAttr(subLlm.attributes, "model")).toBe("claude-haiku-4-5")
    expect(getAttr(subLlm.attributes, "input_tokens")).toBe("500")
    expect(subLlm.parentSpanId).toBe(subInteraction.spanId)

    expect(getAttr(subTool.attributes, "span.type")).toBe("tool_execution")
    expect(getAttr(subTool.attributes, "gen_ai.tool.name")).toBe("Grep")
    // Subagent tool is a sibling of the subagent llm_request, parented to the
    // subagent interaction span (same sibling rule applied recursively).
    expect(subTool.parentSpanId).toBe(subInteraction.spanId)
  })
})
