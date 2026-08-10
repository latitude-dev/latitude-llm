import { ENTERPRISE_PLAN_CONFIG, FREE_PLAN_CONFIG, PRO_PLAN_CONFIG } from "@domain/billing"
import { describe, expect, it } from "vitest"
import { IMPORT_DEFAULT_LOOKBACK_DAYS, IMPORT_HARD_MAX_TRACES, IMPORT_MAX_LOOKBACK_DAYS } from "../constants.ts"
import { type ImportPlanUsage, resolveImportLimits } from "./import-limits.ts"

const usage = (overrides: Partial<ImportPlanUsage> = {}): ImportPlanUsage => ({
  planSlug: "pro",
  retentionDays: PRO_PLAN_CONFIG.retentionDays,
  periodEnd: new Date("2026-02-01T00:00:00Z"),
  ...overrides,
})

describe("resolveImportLimits", () => {
  it("clamps the lookback to the plan's span retention", () => {
    const limits = resolveImportLimits(usage({ retentionDays: FREE_PLAN_CONFIG.retentionDays }))

    // Anything older would be billed and then deleted by the spans TTL.
    expect(limits.maxLookbackDays).toBe(FREE_PLAN_CONFIG.retentionDays)
    expect(limits.lookbackLimitedByRetention).toBe(true)
  })

  it("lets the product cap bind when retention is longer than it", () => {
    const limits = resolveImportLimits(usage({ retentionDays: ENTERPRISE_PLAN_CONFIG.retentionDays }))

    expect(limits.maxLookbackDays).toBe(IMPORT_MAX_LOOKBACK_DAYS)
    expect(limits.lookbackLimitedByRetention).toBe(false)
  })

  it("defaults the lookback to three months when retention allows it", () => {
    expect(resolveImportLimits(usage()).defaultLookbackDays).toBe(IMPORT_DEFAULT_LOOKBACK_DAYS)
  })

  it("shortens the default lookback on a plan that retains less than three months", () => {
    const limits = resolveImportLimits(usage({ retentionDays: FREE_PLAN_CONFIG.retentionDays }))

    expect(limits.defaultLookbackDays).toBe(FREE_PLAN_CONFIG.retentionDays)
  })

  it("never offers a range shorter than the minimum, even on an unusually short retention", () => {
    const limits = resolveImportLimits(usage({ retentionDays: 0 }))

    expect(limits.maxLookbackDays).toBe(limits.minLookbackDays)
    expect(limits.defaultLookbackDays).toBe(limits.minLookbackDays)
  })

  // Plan usage no longer narrows the count. An import meters trace by trace and pauses on the
  // same gate live ingestion answers to, so the ceiling here is only the product's own.
  it("offers the product's trace cap whatever the plan", () => {
    for (const planSlug of ["free", "pro", "enterprise"] as const) {
      const limits = resolveImportLimits(usage({ planSlug }))

      expect(limits.maxTraces).toBe(IMPORT_HARD_MAX_TRACES)
      expect(limits.defaultMaxTraces).toBe(IMPORT_HARD_MAX_TRACES)
    }
  })
})
