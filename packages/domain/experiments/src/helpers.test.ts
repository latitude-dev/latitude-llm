import { describe, expect, it } from "vitest"
import type { ExperimentVariant } from "./entities/experiment.ts"
import {
  computeDelta,
  ensureBaseline,
  newVariant,
  nextDefaultVariantName,
  queryHasSemanticComponent,
  resolveVariantRange,
  variantToSessionsSearch,
  withBaseline,
} from "./helpers.ts"

const now = new Date("2026-07-09T12:00:00.000Z")

const mkVariant = (overrides: Partial<ExperimentVariant> & { id: string }): ExperimentVariant => ({
  name: "V",
  baseline: false,
  filterSet: {},
  query: null,
  timeRange: null,
  ...overrides,
})

describe("resolveVariantRange", () => {
  it("resolves a relative range against now", () => {
    const range = resolveVariantRange({ type: "relative", seconds: 3600 }, now)
    expect(range.toIso).toBe(now.toISOString())
    expect(range.fromIso).toBe(new Date("2026-07-09T11:00:00.000Z").toISOString())
  })

  it("passes through an absolute range", () => {
    const range = resolveVariantRange(
      { type: "absolute", fromIso: "2026-01-01T00:00:00.000Z", toIso: "2026-02-01T00:00:00.000Z" },
      now,
    )
    expect(range).toEqual({ fromIso: "2026-01-01T00:00:00.000Z", toIso: "2026-02-01T00:00:00.000Z" })
  })

  it("falls back to the last 30 days when unset", () => {
    const range = resolveVariantRange(null, now)
    expect(range.toIso).toBe(now.toISOString())
    expect(range.fromIso).toBe(new Date("2026-06-09T12:00:00.000Z").toISOString())
  })
})

describe("nextDefaultVariantName", () => {
  it("names the first variant Variant A", () => {
    expect(nextDefaultVariantName([])).toBe("Variant A")
  })

  it("picks the next unused letter", () => {
    const a = mkVariant({ id: "a".repeat(24), name: "Variant A", baseline: true })
    const b = mkVariant({ id: "b".repeat(24), name: "Variant B" })
    expect(nextDefaultVariantName([a, b])).toBe("Variant C")
  })

  it("fills a gap left by a deleted variant instead of colliding", () => {
    const a = mkVariant({ id: "a".repeat(24), name: "Variant A", baseline: true })
    const c = mkVariant({ id: "c".repeat(24), name: "Variant C" })
    // A and C exist (B was deleted) → next default is the freed "Variant B", not a duplicate "Variant C".
    expect(nextDefaultVariantName([a, c])).toBe("Variant B")
  })

  it("ignores custom-named variants when choosing a letter", () => {
    const custom = mkVariant({ id: "a".repeat(24), name: "Control", baseline: true })
    expect(nextDefaultVariantName([custom])).toBe("Variant A")
  })
})

describe("newVariant", () => {
  it("makes the first variant the baseline named Variant A", () => {
    const created = newVariant([])
    expect(created.baseline).toBe(true)
    expect(created.name).toBe("Variant A")
    expect(created.id).toHaveLength(24)
  })

  it("makes later variants non-baseline with the next unused letter", () => {
    const created = newVariant([mkVariant({ id: "a".repeat(24), name: "Variant A", baseline: true })])
    expect(created.baseline).toBe(false)
    expect(created.name).toBe("Variant B")
  })
})

describe("withBaseline / ensureBaseline", () => {
  const variants = [mkVariant({ id: "a".repeat(24), baseline: true }), mkVariant({ id: "b".repeat(24) })]

  it("moves the baseline flag to the target variant", () => {
    const next = withBaseline(variants, "b".repeat(24))
    expect(next.map((v) => v.baseline)).toEqual([false, true])
  })

  it("promotes the first variant when none is flagged", () => {
    const next = ensureBaseline([mkVariant({ id: "a".repeat(24) }), mkVariant({ id: "b".repeat(24) })])
    expect(next.map((v) => v.baseline)).toEqual([true, false])
  })

  it("is a no-op when a baseline already exists", () => {
    expect(ensureBaseline(variants)).toEqual(variants)
  })
})

describe("computeDelta", () => {
  it("computes a signed fractional change", () => {
    expect(computeDelta(150, 100)).toBeCloseTo(0.5)
    expect(computeDelta(50, 100)).toBeCloseTo(-0.5)
  })

  it("reports an unbounded increase when the baseline is 0 but the value is positive", () => {
    expect(computeDelta(10, 0)).toBe("up-from-zero")
  })

  it("returns null when it cannot be expressed", () => {
    expect(computeDelta(0, 0)).toBeNull()
    expect(computeDelta(null, 100)).toBeNull()
    expect(computeDelta(10, null)).toBeNull()
  })
})

describe("queryHasSemanticComponent", () => {
  it("is false for empty or fully lexical queries", () => {
    expect(queryHasSemanticComponent(null)).toBe(false)
    expect(queryHasSemanticComponent("")).toBe(false)
    expect(queryHasSemanticComponent('"payment failed"')).toBe(false)
    expect(queryHasSemanticComponent("`ordered tokens`")).toBe(false)
  })

  it("is true when free text remains outside phrases", () => {
    expect(queryHasSemanticComponent("user frustration")).toBe(true)
    expect(queryHasSemanticComponent('"payment" refunds')).toBe(true)
  })
})

describe("variantToSessionsSearch", () => {
  it("merges the resolved time range into filters.startTime", () => {
    const search = variantToSessionsSearch(
      {
        filterSet: { status: [{ op: "in", value: ["error"] }] },
        query: "checkout",
        timeRange: { type: "absolute", fromIso: "2026-01-01T00:00:00.000Z", toIso: "2026-02-01T00:00:00.000Z" },
      },
      now,
    )
    expect(search.tab).toBe("sessions")
    expect(search.query).toBe("checkout")
    expect(search.filters.status).toEqual([{ op: "in", value: ["error"] }])
    expect(search.filters.startTime).toEqual([
      { op: "gte", value: "2026-01-01T00:00:00.000Z" },
      { op: "lte", value: "2026-02-01T00:00:00.000Z" },
    ])
  })
})
