import { describe, expect, it } from "vitest"
import { buildOtlpRequest } from "./otlp.ts"
import type { OtlpKeyValue, Turn } from "./types.ts"

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

function baseTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    userText: "hello",
    assistantText: "hi there",
    model: "claude-sonnet-4-6",
    tokens: { input_tokens: 10, output_tokens: 5 },
    toolCalls: [],
    startMs: 1_000,
    endMs: 2_000,
    ...overrides,
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
    expect(getAttr(tool.attributes, "tool.name")).toBe("Bash")
    expect(getAttr(tool.attributes, "tool.id")).toBe("tu_1")
    expect(tool.parentSpanId).toBe(unwrap(spans[1]).spanId)
    expect(tool.traceId).toBe(unwrap(spans[0]).traceId)
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
                  {
                    userText: "find X in repo",
                    assistantText: "X is at foo.ts",
                    model: "claude-haiku-4-5",
                    tokens: { input_tokens: 500, output_tokens: 40 },
                    toolCalls: [{ id: "toolu_grep_1", name: "Grep", input: { pattern: "X" }, output: "match" }],
                    startMs: 1_100,
                    endMs: 1_900,
                  },
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
    const mainLlm = unwrap(spans[1])
    const agentTool = unwrap(spans[2])
    const subInteraction = unwrap(spans[3])
    const subLlm = unwrap(spans[4])
    const subTool = unwrap(spans[5])

    expect(getAttr(agentTool.attributes, "span.type")).toBe("tool_execution")
    expect(getAttr(agentTool.attributes, "tool.name")).toBe("Agent")
    expect(getAttr(agentTool.attributes, "subagent.type")).toBe("Explore")
    expect(getAttr(agentTool.attributes, "subagent.turn_count")).toBe("1")
    expect(agentTool.parentSpanId).toBe(mainLlm.spanId)

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
    expect(getAttr(subTool.attributes, "tool.name")).toBe("Grep")
    expect(subTool.parentSpanId).toBe(subLlm.spanId)
  })
})
