import { CUSTOM_BEHAVIOR_QA_COHORT_LIST } from "@domain/shared/seed-content/custom-behavior-qa"
import { describe, expect, it } from "vitest"
import {
  CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELD,
  customBehaviorFilterSetHasConditions,
  customBehaviorFilterSetSchema,
} from "./custom-behavior.ts"

// The QA cohorts (LAT-752) drive both the seed and the acceptance checks, so
// their filter sets must satisfy the same contract create/update enforce:
// non-empty, and no `topics` (a scoped tree from topics would be circular).
describe("custom-behavior QA cohort spec", () => {
  it("has two cohorts with distinct slugs and ids", () => {
    expect(CUSTOM_BEHAVIOR_QA_COHORT_LIST).toHaveLength(2)
    expect(new Set(CUSTOM_BEHAVIOR_QA_COHORT_LIST.map((cohort) => cohort.slug)).size).toBe(2)
    expect(new Set(CUSTOM_BEHAVIOR_QA_COHORT_LIST.map((cohort) => cohort.idKey)).size).toBe(2)
  })

  it("every cohort filterSet is valid, non-empty, and topic-free", () => {
    for (const cohort of CUSTOM_BEHAVIOR_QA_COHORT_LIST) {
      expect(() => customBehaviorFilterSetSchema.parse(cohort.filterSet)).not.toThrow()
      expect(customBehaviorFilterSetHasConditions(cohort.filterSet)).toBe(true)
      expect(cohort.filterSet[CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELD]).toBeUndefined()
    }
  })
})
