import { describe, expect, it } from "vitest"
import { parseReportedUsd, reportedUsdToMicrocents, resolveSpanCost, usdToMicrocents } from "./estimate-span-cost.ts"

const TOKENS = { tokensInput: 1_000, tokensOutput: 500, tokensCacheRead: 0, tokensCacheCreate: 0, tokensReasoning: 0 }
const NO_TOKENS = { tokensInput: 0, tokensOutput: 0, tokensCacheRead: 0, tokensCacheCreate: 0, tokensReasoning: 0 }
const PRICED = { provider: "openai", model: "gpt-4o-mini" }

const resolve = (reported: Parameters<typeof resolveSpanCost>[0]["reported"], pair = PRICED, tokens = TOKENS) =>
  resolveSpanCost({ reported, ...pair, tokens })

// Every sink that writes a span's cost resolves it here, so these are the terms `cost_source` means
// the same thing on whether the span arrived over OTLP, through the OpenClaw payload or by import.
describe("resolveSpanCost", () => {
  describe("what the source stated", () => {
    it("keeps both sides and the total the source gave, without pricing it again", () => {
      const cost = resolve({ inputMicrocents: 100_000, outputMicrocents: 200_000, totalMicrocents: 300_000 })

      expect(cost).toEqual({
        costInputMicrocents: 100_000,
        costOutputMicrocents: 200_000,
        costTotalMicrocents: 300_000,
        costIsEstimated: false,
        costSource: "provider_reported",
        costPricedProvider: "",
        costPricedModel: "",
      })
    })

    // The distinction the optional fields exist for. A source that prices a call at nothing is
    // stating a rate; estimating over it would replace the source's answer with our guess.
    it("treats a stated zero as a price rather than an absence", () => {
      const cost = resolve({ inputMicrocents: 0, outputMicrocents: 0, totalMicrocents: 0 })

      expect(cost.costTotalMicrocents).toBe(0)
      expect(cost.costIsEstimated).toBe(false)
      expect(cost.costSource).toBe("provider_reported")
    })

    it("sums the sides when the source stated no total", () => {
      const cost = resolve({ inputMicrocents: 100_000, outputMicrocents: 200_000 })

      expect(cost.costTotalMicrocents).toBe(300_000)
      expect(cost.costSource).toBe("provider_reported")
    })
  })

  describe("what it fills in", () => {
    it("prices every side from the catalog when the source stated nothing", () => {
      const cost = resolve({})

      expect(cost.costIsEstimated).toBe(true)
      expect(cost.costInputMicrocents).toBeGreaterThan(0)
      expect(cost.costOutputMicrocents).toBeGreaterThan(0)
      expect(cost.costTotalMicrocents).toBe(cost.costInputMicrocents + cost.costOutputMicrocents)
      expect(cost.costSource).toBe("estimated")
      expect(cost.costPricedProvider).toBe("openai")
      expect(cost.costPricedModel).toBe("gpt-4o-mini")
    })

    // A source with one total and no breakdown, which is what Braintrust reports and what a span
    // carrying only `gen_ai.usage.total_cost` looks like.
    it("estimates the sides beside a total the source stated", () => {
      const cost = resolve({ totalMicrocents: 500_000 })

      expect(cost.costTotalMicrocents).toBe(500_000)
      expect(cost.costInputMicrocents).toBeGreaterThan(0)
      expect(cost.costOutputMicrocents).toBeGreaterThan(0)
      expect(cost.costIsEstimated).toBe(true)
      // The stored total is still the source's, so no catalog entry produced the number that counts.
      expect(cost.costSource).toBe("provider_reported")
      expect(cost.costPricedProvider).toBe("")
    })

    it("estimates only the side the source left out", () => {
      const cost = resolve({ inputMicrocents: 100_000 })

      expect(cost.costInputMicrocents).toBe(100_000)
      expect(cost.costOutputMicrocents).toBeGreaterThan(0)
      expect(cost.costIsEstimated).toBe(true)
    })
  })

  // A stored zero is ambiguous on its own, and the unpriced rollup reads `cost_source` to tell which
  // zeros understate real spend.
  describe("why a zero is zero", () => {
    it("marks tokens no catalog entry priced as unpriced", () => {
      const cost = resolve({}, { provider: "openai", model: "a-model-that-does-not-exist" })

      expect(cost.costTotalMicrocents).toBe(0)
      expect(cost.costSource).toBe("unpriced")
      expect(cost.costIsEstimated).toBe(false)
    })

    // The provider is half the catalog key, so without it there is nothing to look up.
    it("marks a pair with no provider as unpriced", () => {
      expect(resolve({}, { provider: "", model: "gpt-4o-mini" }).costSource).toBe("unpriced")
    })

    it("marks a span with nothing to price as no_tokens", () => {
      const cost = resolve({}, PRICED, NO_TOKENS)

      expect(cost.costTotalMicrocents).toBe(0)
      expect(cost.costSource).toBe("no_tokens")
    })

    // Reported wins even for a pair the catalog cannot price: the source knew the rate, we do not.
    it("still reports a stated cost for a pair the catalog does not know", () => {
      const cost = resolve({ totalMicrocents: 500_000 }, { provider: "acme", model: "acme-1" })

      expect(cost.costTotalMicrocents).toBe(500_000)
      expect(cost.costSource).toBe("provider_reported")
    })
  })

  // The customer's own figure: authoritative, and never topped up from the catalog.
  describe("what the customer reported", () => {
    const resolveUser = (reported: Parameters<typeof resolveSpanCost>[0]["reported"], pair = PRICED) =>
      resolveSpanCost({ reported, reportedBy: "user", ...pair, tokens: TOKENS })

    it("keeps a total alone, with zero sides and no estimate", () => {
      expect(resolveUser({ totalMicrocents: 500_000 })).toEqual({
        costInputMicrocents: 0,
        costOutputMicrocents: 0,
        costTotalMicrocents: 500_000,
        costIsEstimated: false,
        costSource: "user_reported",
        costPricedProvider: "",
        costPricedModel: "",
      })
    })

    it("keeps a zero total as free", () => {
      const cost = resolveUser({ totalMicrocents: 0 })

      expect(cost.costTotalMicrocents).toBe(0)
      expect(cost.costSource).toBe("user_reported")
    })

    it("sums the sides it was given, counting a missing side as zero", () => {
      expect(resolveUser({ inputMicrocents: 100_000, outputMicrocents: 200_000 }).costTotalMicrocents).toBe(300_000)
      expect(resolveUser({ outputMicrocents: 200_000 })).toMatchObject({
        costInputMicrocents: 0,
        costOutputMicrocents: 200_000,
        costTotalMicrocents: 200_000,
        costIsEstimated: false,
      })
    })

    it("keeps sides and total as sent", () => {
      expect(resolveUser({ inputMicrocents: 1, outputMicrocents: 2, totalMicrocents: 10 })).toMatchObject({
        costInputMicrocents: 1,
        costOutputMicrocents: 2,
        costTotalMicrocents: 10,
      })
    })

    it("falls back to the ordinary rules when nothing usable was reported", () => {
      expect(resolveUser({}).costSource).toBe("estimated")
      expect(resolveUser({}, { provider: "acme", model: "acme-1" }).costSource).toBe("unpriced")
    })
  })

  describe("parseReportedUsd", () => {
    it.each([
      [0.25, 0.25],
      [0, 0],
      [-0, 0],
      [3, 3],
      ["0.25", 0.25],
      [" 1e-3 ", 0.001],
      ["0", 0],
    ])("accepts %j", (value, expected) => {
      expect(parseReportedUsd(value)).toBe(expected)
    })

    it.each([
      -0.01,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "-1",
      "",
      " ",
      "abc",
      "0x10",
      "Infinity",
      "1,5",
      1e12,
      undefined,
      null,
      true,
    ])("rejects %j", (value) => {
      expect(parseReportedUsd(value)).toBeUndefined()
    })

    it("converts what it accepts to microcents", () => {
      expect(reportedUsdToMicrocents("0.0025")).toBe(250_000)
      expect(reportedUsdToMicrocents(-1)).toBeUndefined()
    })
  })

  it("converts USD to microcents", () => {
    expect(usdToMicrocents(0.0025)).toBe(250_000)
    expect(usdToMicrocents(0)).toBe(0)
  })
})
