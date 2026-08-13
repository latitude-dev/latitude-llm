import { describe, expect, it } from "vitest"
import { type TaxonomyNameQualityCluster, taxonomyNameQualityMetrics } from "./name-quality.ts"

const cluster = (id: string, parentClusterId: string | null, name: string): TaxonomyNameQualityCluster => ({
  id,
  parentClusterId,
  name,
})

describe("taxonomyNameQualityMetrics", () => {
  it("counts collisions across branches, which the sibling-scoped quality gate cannot see", () => {
    const metrics = taxonomyNameQualityMetrics([
      cluster("root", null, "Everything"),
      cluster("a", "root", "Reporting"),
      cluster("b", "root", "Onboarding"),
      cluster("c", "a", "Client reporting"),
      cluster("d", "b", "Client Reporting"),
    ])

    expect(metrics.leafCount).toBe(2)
    expect(metrics.duplicateNameLeafCount).toBe(2)
    expect(metrics.crossBranchDuplicateLeafCount).toBe(2)
    expect(metrics.duplicateNameRate).toBeCloseTo(1)
  })

  it("reports no duplicates when every leaf name is distinct", () => {
    const metrics = taxonomyNameQualityMetrics([
      cluster("root", null, "Everything"),
      cluster("a", "root", "Invoice disputes"),
      cluster("b", "root", "Refund requests"),
    ])

    expect(metrics.duplicateNameRate).toBe(0)
    expect(metrics.crossBranchDuplicateLeafCount).toBe(0)
  })

  it("measures how much of a sibling set's naming is the shared domain rather than the split", () => {
    const metrics = taxonomyNameQualityMetrics([
      cluster("root", null, "Everything"),
      cluster("a", "root", "Client report generation"),
      cluster("b", "root", "Client report review"),
    ])

    // Two of every three words ("client", "report") are true of both siblings.
    expect(metrics.sharedSiblingWordShare).toBeCloseTo(2 / 3)
  })

  it("ignores leaves still waiting to be named", () => {
    const metrics = taxonomyNameQualityMetrics([
      cluster("root", null, "Everything"),
      cluster("a", "root", "Pending"),
      cluster("b", "root", "Pending"),
      cluster("c", "root", "Refund requests"),
    ])

    expect(metrics.leafCount).toBe(3)
    expect(metrics.namedLeafCount).toBe(1)
    expect(metrics.duplicateNameRate).toBe(0)
  })

  it("catches siblings sharing most of their vocabulary without colliding exactly", () => {
    const metrics = taxonomyNameQualityMetrics([
      cluster("root", null, "Everything"),
      cluster("a", "root", "Client report generation"),
      cluster("b", "root", "Client report review"),
      cluster("c", "root", "Refund disputes"),
    ])

    expect(metrics.duplicateNameRate).toBe(0)
    expect(metrics.nearDuplicateNamePairCount).toBe(1)
    expect(metrics.nearDuplicateNameRate).toBeCloseTo(1 / 3)
  })

  it("scores names across the whole tree, not only within a sibling set", () => {
    const metrics = taxonomyNameQualityMetrics([
      cluster("root", null, "Everything"),
      cluster("a", "root", "Reporting"),
      cluster("b", "root", "Onboarding"),
      cluster("c", "a", "Weekly report export"),
      cluster("d", "b", "Weekly report review"),
    ])

    expect(metrics.nearDuplicateNamePairCount).toBe(1)
  })

  it("scores unspaced names by segmented words rather than reading them as one token", () => {
    const metrics = taxonomyNameQualityMetrics([
      cluster("root", null, "全部"),
      cluster("a", "root", "报告生成与导出"),
      cluster("b", "root", "报告生成与查询"),
    ])

    expect(metrics.nearDuplicateNamePairCount).toBe(1)
    expect(metrics.nearDuplicateNameRate).toBe(1)
  })

  it("compares composed and decomposed accents as the same name", () => {
    const metrics = taxonomyNameQualityMetrics([
      cluster("root", null, "Todo"),
      cluster("a", "root", "Facturación de créditos".normalize("NFD")),
      cluster("b", "root", "Facturación de créditos".normalize("NFC")),
    ])

    expect(metrics.nearDuplicateNameRate).toBe(1)
  })

  it("does not count leaves still waiting to be named as near-duplicates of each other", () => {
    const metrics = taxonomyNameQualityMetrics([
      cluster("root", null, "Everything"),
      cluster("a", "root", "Pending"),
      cluster("b", "root", "Pending"),
      cluster("c", "root", "Refund requests"),
    ])

    expect(metrics.nearDuplicateNamePairCount).toBe(0)
    expect(metrics.nearDuplicateNameRate).toBe(0)
  })

  it("treats a lone root as the tree's only leaf", () => {
    const metrics = taxonomyNameQualityMetrics([cluster("root", null, "Ad campaign troubleshooting")])

    expect(metrics.leafCount).toBe(1)
    expect(metrics.namedLeafCount).toBe(1)
    expect(metrics.sharedSiblingWordShare).toBe(0)
  })
})
