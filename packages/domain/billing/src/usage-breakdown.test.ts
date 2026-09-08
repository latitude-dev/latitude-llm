import { ProjectId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { billingUsageCategoryFor, summarizeBillingUsageBreakdown } from "./usage-breakdown.ts"

const PROJECT_A = ProjectId("a".repeat(24))
const PROJECT_B = ProjectId("b".repeat(24))

describe("billingUsageCategoryFor", () => {
  it("classifies trace and eval-scan rows by action regardless of label", () => {
    expect(billingUsageCategoryFor({ action: "trace", meteringLabel: null })).toBe("traces")
    expect(billingUsageCategoryFor({ action: "eval-scan", meteringLabel: null })).toBe("evaluations")
    expect(billingUsageCategoryFor({ action: "trace", meteringLabel: "signal-refresh" })).toBe("traces")
  })

  it("classifies AI rows by their metering label", () => {
    expect(billingUsageCategoryFor({ action: "llm-call", meteringLabel: "flagger-classify" })).toBe("flaggers")
    expect(billingUsageCategoryFor({ action: "llm-call", meteringLabel: "flagger" })).toBe("flaggers")
    expect(billingUsageCategoryFor({ action: "semantic-query", meteringLabel: "live-eval" })).toBe("evaluations")
    expect(billingUsageCategoryFor({ action: "llm-call", meteringLabel: "eval-optimize" })).toBe("evaluations")
    expect(billingUsageCategoryFor({ action: "llm-call", meteringLabel: "signal-promotion" })).toBe("signals")
    expect(billingUsageCategoryFor({ action: "llm-call", meteringLabel: "signal-create" })).toBe("signals")
    expect(billingUsageCategoryFor({ action: "llm-call", meteringLabel: "taxonomy-facet-extract" })).toBe("behaviors")
    expect(billingUsageCategoryFor({ action: "llm-call", meteringLabel: "session-analysis" })).toBe("moments")
    expect(billingUsageCategoryFor({ action: "llm-call", meteringLabel: "annotation-enrich" })).toBe("annotations")
  })

  it("falls back to other for AI rows whose label is unknown or missing", () => {
    expect(billingUsageCategoryFor({ action: "llm-call", meteringLabel: "not-a-label" })).toBe("other")
    expect(billingUsageCategoryFor({ action: "llm-call", meteringLabel: null })).toBe("other")
  })
})

describe("summarizeBillingUsageBreakdown", () => {
  it("folds ledger rows into one row per project and category, largest first", () => {
    const rows = summarizeBillingUsageBreakdown([
      { projectId: PROJECT_A, action: "trace", meteringLabel: null, credits: 120 },
      { projectId: PROJECT_A, action: "eval-scan", meteringLabel: null, credits: 10 },
      { projectId: PROJECT_A, action: "llm-call", meteringLabel: "live-eval", credits: 40 },
      { projectId: PROJECT_A, action: "semantic-query", meteringLabel: "live-eval", credits: 5 },
      { projectId: PROJECT_A, action: "llm-call", meteringLabel: "signal-assign", credits: 30 },
      { projectId: PROJECT_B, action: "trace", meteringLabel: null, credits: 200 },
      { projectId: PROJECT_B, action: "llm-call", meteringLabel: "mystery", credits: 7 },
    ])

    expect(rows).toEqual([
      { projectId: PROJECT_B, category: "traces", credits: 200 },
      { projectId: PROJECT_A, category: "traces", credits: 120 },
      { projectId: PROJECT_A, category: "evaluations", credits: 55 },
      { projectId: PROJECT_A, category: "signals", credits: 30 },
      { projectId: PROJECT_B, category: "other", credits: 7 },
    ])
  })

  it("returns nothing for an empty ledger", () => {
    expect(summarizeBillingUsageBreakdown([])).toEqual([])
  })
})
