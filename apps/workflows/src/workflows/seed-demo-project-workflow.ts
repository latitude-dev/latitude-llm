import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

/**
 * Three sequential activities, one per datastore. Each writes a fresh
 * project's worth of seed content (datasets, evaluations, issues, queues,
 * scores, ~30 days of telemetry) under the supplied
 * `(organizationId, projectId)` pair.
 *
 * Postgres → ClickHouse → Weaviate is the dependency order. ClickHouse
 * doesn't strictly read from Postgres at write-time, but the row identity
 * is shared via the `SeedScope`'s deterministic id derivation — running
 * Postgres first means the audit trail (and the org's project list)
 * surfaces a non-empty project before the longer telemetry insert kicks
 * off. Weaviate goes last because issue projections derive from issue ids
 * the Postgres activity wrote.
 *
 * Activity timeouts: 15 minutes. The full ClickHouse insert (the long
 * pole) typically completes in under five minutes on a healthy cluster
 * but spikes are routine on shared infra; the cap is generous so a slow
 * insert doesn't trip the retry policy.
 *
 * TODO: half-seeded failures are accepted for v1 — if any activity errors
 * after exhausting retries, the project row already exists (the use-case
 * created it) but its content is partial. Operators clean up via the
 * existing `softDeleteProject` admin server function.
 */
const { seedDemoProjectPostgresActivity, seedDemoProjectClickHouseActivity, seedDemoProjectWeaviateActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "15 minutes",
    retry: defaultActivityRetryPolicy,
  })

export interface SeedDemoProjectWorkflowInput {
  readonly organizationId: string
  readonly projectId: string
  /**
   * Org members that the seeded annotation-queue items should round-robin
   * across as `assignedTo`. Picked in the request handler so workflow
   * replays see a stable list; `Math.random` inside workflow code is a
   * Temporal footgun.
   */
  readonly queueAssigneeUserIds: readonly string[]
  /**
   * Captured at workflow-start time so all three datastores' seeded rows
   * pin to the same "now". A fresh `new Date()` per activity would drift
   * across retries.
   */
  readonly timelineAnchorIso: string
}

export const seedDemoProjectWorkflow = async (input: SeedDemoProjectWorkflowInput) => {
  await seedDemoProjectPostgresActivity(input)
  await seedDemoProjectClickHouseActivity(input)
  await seedDemoProjectWeaviateActivity(input)

  return { action: "seeded" as const, projectId: input.projectId }
}
