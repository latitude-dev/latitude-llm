import {
  CUSTOM_BEHAVIOR_QA_COHORT_LIST,
  CUSTOM_BEHAVIOR_QA_COHORTS,
} from "@domain/shared/seed-content/custom-behavior-qa"
import { describe, expect, it } from "vitest"
import { TAXONOMY_GARDENING_MIN_OBSERVATIONS } from "../constants.ts"
import {
  CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELD,
  customBehaviorFilterSetHasConditions,
  customBehaviorFilterSetSchema,
} from "./custom-behavior.ts"

const cohortSize = (cohort: (typeof CUSTOM_BEHAVIOR_QA_COHORT_LIST)[number]) =>
  cohort.subTopics.reduce((sum, topic) => sum + topic.sessionCount, 0)

// The QA cohorts drive both the seed and the acceptance checks, so
// their filter sets must satisfy the same contract create/update enforce:
// non-empty, and no `topics` (a scoped tree from topics would be circular).
describe("custom-behavior QA cohort spec", () => {
  it("has three cohorts with distinct slugs and ids", () => {
    expect(CUSTOM_BEHAVIOR_QA_COHORT_LIST).toHaveLength(3)
    expect(new Set(CUSTOM_BEHAVIOR_QA_COHORT_LIST.map((cohort) => cohort.slug)).size).toBe(3)
    expect(new Set(CUSTOM_BEHAVIOR_QA_COHORT_LIST.map((cohort) => cohort.idKey)).size).toBe(3)
  })

  it("every cohort filterSet is valid, non-empty, and topic-free", () => {
    for (const cohort of CUSTOM_BEHAVIOR_QA_COHORT_LIST) {
      expect(() => customBehaviorFilterSetSchema.parse(cohort.filterSet)).not.toThrow()
      expect(customBehaviorFilterSetHasConditions(cohort.filterSet)).toBe(true)
      expect(cohort.filterSet[CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELD]).toBeUndefined()
    }
  })

  it("seeds two cohorts above the gardening gate and one below it (the waiting state)", () => {
    const { a, b, c } = CUSTOM_BEHAVIOR_QA_COHORTS
    expect(cohortSize(a)).toBeGreaterThanOrEqual(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
    expect(cohortSize(b)).toBeGreaterThanOrEqual(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
    expect(cohortSize(c)).toBeLessThan(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
  })
})
