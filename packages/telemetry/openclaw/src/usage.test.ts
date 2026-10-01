import { describe, expect, it } from "vitest"
import { finishReason, usageAttrsFromAggregate, usageAttrsFromTranscript } from "./usage.ts"

describe("usageAttrsFromTranscript", () => {
  it("maps tokens, reasoning and catalog cost", () => {
    const attrs = usageAttrsFromTranscript({
      input: 100,
      output: 20,
      cacheRead: 30,
      cacheWrite: 4,
      totalTokens: 154,
      reasoningTokens: 6,
      cost: { input: 0.001, output: 0.002, cacheRead: 0.0001, cacheWrite: 0.0002, total: 0.0033 },
    })
    expect(attrs["gen_ai.usage.input_tokens"]).toBe(100)
    expect(attrs["gen_ai.usage.output_tokens"]).toBe(20)
    expect(attrs["gen_ai.usage.cache_read.input_tokens"]).toBe(30)
    expect(attrs["gen_ai.usage.cache_creation.input_tokens"]).toBe(4)
    expect(attrs["gen_ai.usage.reasoning_tokens"]).toBe(6)
    expect(attrs["gen_ai.usage.total_tokens"]).toBe(154)
    expect(attrs["gen_ai.usage.cost"]).toBeCloseTo(0.0033)
    expect(attrs["gen_ai.usage.input_cost"]).toBeCloseTo(0.0013)
    expect(attrs["gen_ai.usage.output_cost"]).toBeCloseTo(0.002)
    expect(attrs["openclaw.cost.origin"]).toBe("catalog")
  })

  it("omits cost when the total is zero and derives the total token count", () => {
    const attrs = usageAttrsFromTranscript({ input: 1, output: 2, cacheRead: 3, cacheWrite: 0, cost: { total: 0 } })
    expect(attrs["gen_ai.usage.cost"]).toBeUndefined()
    expect(attrs["gen_ai.usage.total_tokens"]).toBe(6)
  })

  it("marks provider-billed totals", () => {
    const attrs = usageAttrsFromTranscript({
      input: 1,
      output: 1,
      cost: { total: 0.5, totalOrigin: "provider-billed" },
    })
    expect(attrs["openclaw.cost.origin"]).toBe("provider-billed")
  })
})

describe("usageAttrsFromAggregate", () => {
  it("maps the attempt aggregate", () => {
    const attrs = usageAttrsFromAggregate({ input: 10, output: 5, cacheRead: 1, cacheWrite: 0 })
    expect(attrs["gen_ai.usage.total_tokens"]).toBe(16)
    expect(attrs["gen_ai.usage.cache_read.input_tokens"]).toBe(1)
  })
})

describe("finishReason", () => {
  it("maps pi-ai stop reasons onto the GenAI vocabulary", () => {
    expect(finishReason("toolUse")).toBe("tool_calls")
    expect(finishReason("aborted")).toBe("cancelled")
    expect(finishReason("stop")).toBe("stop")
    expect(finishReason(undefined)).toBeUndefined()
  })
})
