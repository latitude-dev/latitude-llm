import { ENTERPRISE_PLAN_CONFIG, FREE_PLAN_CONFIG } from "@domain/billing"
import { describe, expect, it } from "vitest"
import {
  IMPORT_DEFAULT_LOOKBACK_DAYS,
  IMPORT_HARD_MAX_TRACES,
  IMPORT_MAX_LOOKBACK_DAYS,
  IMPORT_MIN_LOOKBACK_DAYS,
} from "../constants.ts"
import { stubImportPlan } from "../testing/fakes.ts"
import { STUB_IMPORT_ORGANIZATION_ID, stubEnterprisePlan, stubFreePlan } from "../testing/harness.ts"
import { importLimitsForPlan } from "./resolve-import-limits.ts"

describe("importLimitsForPlan", () => {
  describe("trace ceiling", () => {
    // Plan usage does not narrow it. An import meters trace by trace and pauses on the same gate
    // live ingestion answers to, so budgeting the batch up front would only mean estimating what a
    // trace costs downstream and being wrong about it in the user's face.
    it("is the product cap on every plan", () => {
      for (const plan of [stubFreePlan(), stubEnterprisePlan()]) {
        const limits = importLimitsForPlan(plan)

        expect(limits.maxTraces).toBe(IMPORT_HARD_MAX_TRACES)
        expect(limits.defaultMaxTraces).toBe(IMPORT_HARD_MAX_TRACES)
      }
    })
  })

  describe("lookback", () => {
    it("is bounded by the plan's span retention", () => {
      const limits = importLimitsForPlan(stubFreePlan())

      expect(limits.maxLookbackDays).toBe(FREE_PLAN_CONFIG.retentionDays)
      expect(limits.lookbackLimitedByRetention).toBe(true)
      expect(limits.defaultLookbackDays).toBe(FREE_PLAN_CONFIG.retentionDays)
    })

    it("is bounded by the product cap when retention reaches further", () => {
      const limits = importLimitsForPlan(stubEnterprisePlan())

      expect(limits.maxLookbackDays).toBe(IMPORT_MAX_LOOKBACK_DAYS)
      expect(limits.lookbackLimitedByRetention).toBe(false)
      expect(limits.defaultLookbackDays).toBe(IMPORT_DEFAULT_LOOKBACK_DAYS)
    })

    it("never offers less than the minimum, even on an unusually short retention", () => {
      const limits = importLimitsForPlan(stubImportPlan(STUB_IMPORT_ORGANIZATION_ID, { plan: { retentionDays: 0 } }))

      expect(limits.minLookbackDays).toBe(IMPORT_MIN_LOOKBACK_DAYS)
      expect(limits.maxLookbackDays).toBe(IMPORT_MIN_LOOKBACK_DAYS)
    })
  })

  // Read off the resolved plan, so a wrong field name here would silently mis-limit an import.
  it("reports the slug, retention and period end from the resolved plan", () => {
    const plan = stubFreePlan()
    const limits = importLimitsForPlan(plan)

    expect(limits.planSlug).toBe(FREE_PLAN_CONFIG.slug)
    expect(limits.retentionDays).toBe(FREE_PLAN_CONFIG.retentionDays)
    expect(limits.periodEnd).toEqual(plan.periodEnd)
    expect(ENTERPRISE_PLAN_CONFIG.retentionDays).toBeGreaterThan(FREE_PLAN_CONFIG.retentionDays)
  })
})
