import type { FilterSet } from "../filter.ts"

/**
 * Shared spec for the two QA custom-behavior cohorts (LAT-752). Both the
 * Postgres seeder (which writes the `custom_behaviors` rows) and the
 * ClickHouse seeder (which writes the backing sessions + taxonomy
 * observations) read from this single source so a behavior's `filterSet`
 * always matches the cohort's session attributes.
 *
 * Cohort A is scoped by `user_id`; Cohort B by `service_names`. Neither uses
 * `topics` — a scoped tree built from a topics filter would be circular
 * (rejected by `customBehaviorFilterSetSchema`).
 */

/** Fictional user the Cohort A sessions belong to; matched by Behavior A's filter. */
export const CUSTOM_BEHAVIOR_QA_USER_ID = "usr-wile-e-coyote"
/** Service name the Cohort B sessions report; matched by Behavior B's filter (≙ `metadata.domain = retail`). */
export const CUSTOM_BEHAVIOR_QA_SERVICE_NAME = "tau2-retail-support-agent"

export interface CustomBehaviorQaSubTopic {
  /** Salt for this sub-topic's centroid — distinct salts yield near-orthogonal 2048-dim centroids. */
  readonly key: string
  /** Human-readable blurb stored in the observation's projection metadata. */
  readonly summary: string
  /** How many sessions (one observation each) to generate around this centroid. */
  readonly sessionCount: number
}

export interface CustomBehaviorQaCohort {
  /** `SeedScope.cuid` key → deterministic custom behavior id, stable across re-seeds. */
  readonly idKey: string
  readonly slug: string
  readonly name: string
  /** `service_name` written on every span in the cohort. */
  readonly serviceName: string
  /** `user_id` written on every span in the cohort (empty = unattributed). */
  readonly userId: string
  /** Extra span metadata (rolled up onto the session). */
  readonly metadata: Record<string, string>
  /** The behavior definition's filter — compiles to the same session set the cohort creates. */
  readonly filterSet: FilterSet
  readonly subTopics: readonly CustomBehaviorQaSubTopic[]
}

const cohortA: CustomBehaviorQaCohort = {
  idKey: "custom-behavior-qa-a",
  slug: "qa-coyote-behaviors",
  name: "QA · Wile E. Coyote sessions",
  serviceName: "custom-behavior-qa-agent",
  userId: CUSTOM_BEHAVIOR_QA_USER_ID,
  metadata: { seed: "custom-behavior-qa", cohort: "a" },
  filterSet: { userId: [{ op: "in", value: [CUSTOM_BEHAVIOR_QA_USER_ID] }] },
  subTopics: [
    { key: "a-order-status", summary: "Where is my order — delivery and tracking questions.", sessionCount: 15 },
    { key: "a-returns", summary: "Return and refund eligibility for delivered items.", sessionCount: 14 },
    { key: "a-account-access", summary: "Login, password reset, and account recovery help.", sessionCount: 13 },
  ],
}

const cohortB: CustomBehaviorQaCohort = {
  idKey: "custom-behavior-qa-b",
  slug: "qa-retail-support",
  name: "QA · Retail support agent",
  serviceName: CUSTOM_BEHAVIOR_QA_SERVICE_NAME,
  userId: "",
  metadata: { seed: "custom-behavior-qa", cohort: "b", domain: "retail" },
  filterSet: { serviceNames: [{ op: "in", value: [CUSTOM_BEHAVIOR_QA_SERVICE_NAME] }] },
  subTopics: [
    { key: "b-exchange", summary: "Exchange a delivered item for a different size or colour.", sessionCount: 15 },
    { key: "b-payment", summary: "Payment method updates and failed-charge troubleshooting.", sessionCount: 14 },
    { key: "b-cancellation", summary: "Cancel or modify an order before it ships.", sessionCount: 13 },
  ],
}

export const CUSTOM_BEHAVIOR_QA_COHORTS = { a: cohortA, b: cohortB } as const

export const CUSTOM_BEHAVIOR_QA_COHORT_LIST: readonly CustomBehaviorQaCohort[] = [cohortA, cohortB]
