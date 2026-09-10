import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { InvalidCostMetricCatalogError } from "../errors.ts"
import { COST_FAMILIES } from "./cost-evidence.ts"
import {
  type CostMetricCatalogEntry,
  costApplicabilityRuleSchema,
  costMetricCatalogEntrySchema,
  costMetricCatalogSchema,
  PROVISIONAL_COST_METRIC_CATALOG,
} from "./cost-metric-catalog.ts"
import { loadCostMetricCatalog } from "./cost-scoring-artifact.ts"

const entry = {
  metricId: "tools.repeated_call",
  family: "tools",
  rawUnit: "toolCalls",
  aggregation: "eventRate",
  readerId: "tools.repetition",
  curveId: "tools.repeated_call",
  overlapGroup: "tools.repeated-calls",
  applicability: {
    requirements: ["comparableToolCalls"],
    minimumComparableUnits: 2,
    description: "At least two comparable tool calls.",
  },
  coverageFloor: 0.5,
  destinations: ["cost", "tools"],
} satisfies CostMetricCatalogEntry

describe("costMetricCatalogEntrySchema", () => {
  it("accepts a complete entry", () => {
    expect(costMetricCatalogEntrySchema.parse(entry).metricId).toBe("tools.repeated_call")
  })

  it("rejects a family and raw unit that do not belong together", () => {
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, family: "spend" }).success).toBe(false)
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, rawUnit: "microcents" }).success).toBe(false)
  })

  it("rejects invalid coverage floors and empty identifiers", () => {
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, coverageFloor: -0.1 }).success).toBe(false)
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, coverageFloor: 1.5 }).success).toBe(false)
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, coverageFloor: Number.POSITIVE_INFINITY }).success).toBe(
      false,
    )
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, metricId: "" }).success).toBe(false)
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, readerId: "" }).success).toBe(false)
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, curveId: "" }).success).toBe(false)
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, overlapGroup: "" }).success).toBe(false)
  })

  it("requires at least one unique product destination", () => {
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, destinations: [] }).success).toBe(false)
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, destinations: ["cost", "cost"] }).success).toBe(false)
    expect(costMetricCatalogEntrySchema.safeParse({ ...entry, destinations: ["signals", "billing"] }).success).toBe(
      false,
    )
  })
})

describe("costApplicabilityRuleSchema", () => {
  it("ties a minimum comparable unit count to a comparison requirement", () => {
    expect(
      costApplicabilityRuleSchema.safeParse({
        requirements: ["comparableToolCalls"],
        description: "Comparable calls.",
      }).success,
    ).toBe(false)
    expect(
      costApplicabilityRuleSchema.safeParse({
        requirements: ["pricedUsageSpan"],
        minimumComparableUnits: 2,
        description: "Priced spend.",
      }).success,
    ).toBe(false)
    expect(
      costApplicabilityRuleSchema.safeParse({
        requirements: ["comparableToolCalls"],
        minimumComparableUnits: 0,
        description: "Comparable calls.",
      }).success,
    ).toBe(false)
  })

  it("requires a non-empty unique requirement list and a description", () => {
    expect(costApplicabilityRuleSchema.safeParse({ requirements: [], description: "None." }).success).toBe(false)
    expect(
      costApplicabilityRuleSchema.safeParse({
        requirements: ["pricedUsageSpan", "pricedUsageSpan"],
        description: "Priced spend.",
      }).success,
    ).toBe(false)
    expect(costApplicabilityRuleSchema.safeParse({ requirements: ["pricedUsageSpan"], description: "" }).success).toBe(
      false,
    )
    expect(
      costApplicabilityRuleSchema.safeParse({ requirements: ["unknownRequirement"], description: "?" }).success,
    ).toBe(false)
  })
})

describe("costMetricCatalogSchema", () => {
  it("rejects duplicate metric ids", () => {
    expect(
      costMetricCatalogSchema.safeParse({
        catalogVersion: "test",
        calibration: "provisional",
        entries: [entry, { ...entry, curveId: "other" }],
      }).success,
    ).toBe(false)
  })

  it("requires a version, a calibration state, and at least one entry", () => {
    expect(
      costMetricCatalogSchema.safeParse({ catalogVersion: "", calibration: "provisional", entries: [entry] }).success,
    ).toBe(false)
    expect(
      costMetricCatalogSchema.safeParse({ catalogVersion: "test", calibration: "unknown", entries: [entry] }).success,
    ).toBe(false)
    expect(
      costMetricCatalogSchema.safeParse({ catalogVersion: "test", calibration: "provisional", entries: [] }).success,
    ).toBe(false)
  })
})

describe("PROVISIONAL_COST_METRIC_CATALOG", () => {
  it("validates and stays explicitly uncalibrated", () => {
    const catalog = Effect.runSync(loadCostMetricCatalog(PROVISIONAL_COST_METRIC_CATALOG))

    expect(catalog.calibration).toBe("provisional")
    expect(catalog.catalogVersion).toContain("provisional")
  })

  it("represents the launch catalog across all five families", () => {
    expect(PROVISIONAL_COST_METRIC_CATALOG.entries.map((catalogEntry) => catalogEntry.metricId)).toEqual([
      "cost.recoverable_spend_share",
      "cost.cache_gap",
      "context.redundant_input_share",
      "context.avoidable_pressure",
      "tools.dead_surface",
      "tools.repeated_call",
      "tools.thrashing",
      "tools.structural_defect",
      "memory.repeated_zero_hit",
      "memory.noop_rewrite",
      "memory.reverted_write",
      "recovery.recovered_incident_rate",
    ])
    expect(new Set(PROVISIONAL_COST_METRIC_CATALOG.entries.map((catalogEntry) => catalogEntry.family))).toEqual(
      new Set(COST_FAMILIES),
    )
  })

  it("shares one overlap group between repeated calls and thrashing", () => {
    const overlapGroupOf = (metricId: string) =>
      PROVISIONAL_COST_METRIC_CATALOG.entries.find((catalogEntry) => catalogEntry.metricId === metricId)?.overlapGroup

    expect(overlapGroupOf("tools.repeated_call")).toBe(overlapGroupOf("tools.thrashing"))
    expect(overlapGroupOf("context.redundant_input_share")).toBe(overlapGroupOf("context.avoidable_pressure"))
  })

  it("fails the load with readable issues when an entry is malformed", () => {
    const result = Effect.runSync(
      Effect.result(
        loadCostMetricCatalog({
          ...PROVISIONAL_COST_METRIC_CATALOG,
          entries: [{ ...entry, rawUnit: "microcents" }],
        }),
      ),
    )

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(InvalidCostMetricCatalogError)
      expect(result.failure.issues.join(" ")).toContain("raw unit does not belong to the Cost family")
    }
  })
})
