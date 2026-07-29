import { describe, expect, it } from "vitest"
import { rollupCostDisplay, spanCostDisplay } from "./cost-display.ts"

describe("rollupCostDisplay", () => {
  it("shows the price when every span was priced", () => {
    expect(rollupCostDisplay({ costTotalMicrocents: 102_000_000, unpricedSpanCount: 0, tokensTotal: 500 })).toEqual({
      label: "$1.02",
    })
  })

  // A rollup cannot claim Free: unpricedSpanCount is 0 both when every span priced and on any row
  // rolled up before the column existed, so Free would be wrong for every pre-existing trace.
  it("does not claim Free for a zero total, even when no span is known to be unpriced", () => {
    const display = rollupCostDisplay({ costTotalMicrocents: 0, unpricedSpanCount: 0, tokensTotal: 500 })
    expect(display.label).toBe("-")
    expect(display.note).toContain("cannot tell free apart from unpriced")
  })

  it("does not claim Free when a span in the group could not be priced", () => {
    const display = rollupCostDisplay({ costTotalMicrocents: 0, unpricedSpanCount: 2, tokensTotal: 500 })
    expect(display.label).toBe("-")
    expect(display.note).toContain("2 spans")
  })

  it("qualifies a non-zero total that omits unpriced spans", () => {
    const display = rollupCostDisplay({ costTotalMicrocents: 102_000_000, unpricedSpanCount: 1, tokensTotal: 500 })
    expect(display.label).toBe("$1.02")
    expect(display.note).toContain("1 span")
  })

  it("shows nothing for a group with no token usage", () => {
    expect(rollupCostDisplay({ costTotalMicrocents: 0, unpricedSpanCount: 0, tokensTotal: 0 })).toEqual({ label: "-" })
  })
})

describe("spanCostDisplay", () => {
  // Defaults price against exactly what was reported, which is the quiet majority of spans.
  const span = (over: Partial<Parameters<typeof spanCostDisplay>[0]>) => ({
    costTotalMicrocents: 0,
    costSource: "estimated" as const,
    provider: "openai",
    model: "gpt-4o",
    costPricedProvider: "openai",
    costPricedModel: "gpt-4o",
    ...over,
  })

  it.each(["provider_reported", "estimated"] as const)("shows Free for a priced zero from %s", (costSource) => {
    expect(spanCostDisplay(span({ costSource }))).toEqual({ label: "Free" })
  })

  it("shows a gap for an unpriced span", () => {
    const display = spanCostDisplay(span({ costSource: "unpriced", costPricedProvider: "", costPricedModel: "" }))
    expect(display.label).toBe("-")
    expect(display.note).toContain("no known pricing")
  })

  it("does not read a pre-split zero as free", () => {
    const display = spanCostDisplay(span({ costSource: "unknown", costPricedProvider: "", costPricedModel: "" }))
    expect(display.label).toBe("-")
    expect(display.note).toContain("before cost sources were tracked")
  })

  it("shows nothing for a span with no token usage", () => {
    expect(spanCostDisplay(span({ costSource: "no_tokens", costPricedProvider: "", costPricedModel: "" }))).toEqual({
      label: "-",
    })
  })

  it("shows the price whatever the source", () => {
    expect(spanCostDisplay(span({ costTotalMicrocents: 102_000_000 }))).toEqual({ label: "$1.02" })
  })

  it("says nothing extra when the price came from what was reported", () => {
    expect(spanCostDisplay(span({ costTotalMicrocents: 102_000_000 })).note).toBeUndefined()
  })

  it("names the provider it priced against when a gateway was reported", () => {
    const display = spanCostDisplay(
      span({
        costTotalMicrocents: 102_000_000,
        provider: "stripe",
        model: "openai/gpt-5.4",
        costPricedProvider: "openai",
        costPricedModel: "gpt-5.4",
      }),
    )
    expect(display.note).toBe("Estimated from openai / gpt-5.4 pricing.")
  })

  it("names only the model when a dated id resolved to its base entry", () => {
    const display = spanCostDisplay(
      span({ costTotalMicrocents: 102_000_000, model: "gpt-4.1-2025-04-14", costPricedModel: "gpt-4.1" }),
    )
    expect(display.note).toBe("Estimated from gpt-4.1 pricing.")
  })

  // Rows written before the columns existed have both empty. That is missing information, not a
  // mismatch, so it must not be reported as having priced against something else.
  it("stays quiet for a row stored before the priced-against columns existed", () => {
    const display = spanCostDisplay(
      span({ costTotalMicrocents: 102_000_000, costPricedProvider: "", costPricedModel: "" }),
    )
    expect(display.note).toBeUndefined()
  })
})
