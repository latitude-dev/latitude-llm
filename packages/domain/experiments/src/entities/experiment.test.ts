import { describe, expect, it } from "vitest"
import { baselineVariant, type ExperimentVariant, experimentSchema } from "./experiment.ts"

const organizationId = "o".repeat(24)
const projectId = "p".repeat(24)
const experimentId = "e".repeat(24)

const variant = (overrides: Partial<ExperimentVariant> & { id: string }): ExperimentVariant => ({
  name: "Variant",
  baseline: false,
  filterSet: {},
  query: null,
  timeRange: null,
  ...overrides,
})

const base = {
  id: experimentId,
  organizationId,
  projectId,
  slug: "checkout-comparison",
  name: "Checkout comparison",
  description: "",
  deletedAt: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
}

describe("experimentSchema", () => {
  it("accepts an empty experiment with no variants and no baseline", () => {
    const parsed = experimentSchema.safeParse({ ...base, variants: [] })
    expect(parsed.success).toBe(true)
  })

  it("accepts an experiment with exactly one baseline variant", () => {
    const parsed = experimentSchema.safeParse({
      ...base,
      variants: [
        variant({ id: "a".repeat(24), name: "Baseline", baseline: true }),
        variant({ id: "b".repeat(24), name: "Variant A" }),
      ],
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(baselineVariant(parsed.data)?.id).toBe("a".repeat(24))
  })

  it("rejects a non-empty experiment with no baseline", () => {
    const parsed = experimentSchema.safeParse({
      ...base,
      variants: [
        variant({ id: "a".repeat(24), name: "Variant A" }),
        variant({ id: "b".repeat(24), name: "Variant B" }),
      ],
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects more than one baseline", () => {
    const parsed = experimentSchema.safeParse({
      ...base,
      variants: [
        variant({ id: "a".repeat(24), name: "Variant A", baseline: true }),
        variant({ id: "b".repeat(24), name: "Variant B", baseline: true }),
      ],
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects duplicate variant ids", () => {
    const parsed = experimentSchema.safeParse({
      ...base,
      variants: [
        variant({ id: "a".repeat(24), name: "Variant A", baseline: true }),
        variant({ id: "a".repeat(24), name: "Variant B" }),
      ],
    })
    expect(parsed.success).toBe(false)
  })

  it("accepts duplicate variant names (name uniqueness is a write-time rule, not a storage invariant)", () => {
    const parsed = experimentSchema.safeParse({
      ...base,
      variants: [
        variant({ id: "a".repeat(24), name: "Variant A", baseline: true }),
        variant({ id: "b".repeat(24), name: "Variant A" }),
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects more than the maximum number of variants", () => {
    const variants = Array.from({ length: 11 }, (_, index) =>
      variant({ id: String(index).padStart(24, "0"), name: `Variant ${index}`, baseline: index === 0 }),
    )
    const parsed = experimentSchema.safeParse({ ...base, variants })
    expect(parsed.success).toBe(false)
  })
})
