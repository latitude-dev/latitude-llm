import { executeChild, patched, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"
import { gardenTaxonomyWorkflow } from "./taxonomy-gardening-workflow.ts"

/**
 * Seeds the base demo content and the derived read models that make the
 * demo immediately usable. The first two activities write a fresh project's
 * worth of seed content (datasets, evaluations, issues, queues, scores,
 * tau telemetry) under the supplied `(organizationId, projectId)` pair.
 * The derived activities then build trace-search documents/embeddings and
 * run taxonomy observation + gardening so behaviours are visible without
 * waiting for background workers.
 *
 * Postgres → ClickHouse is the dependency order. ClickHouse doesn't
 * strictly read from Postgres at write-time, but the row identity is shared
 * via the `SeedScope`'s deterministic id derivation — running Postgres
 * first means the audit trail (and the org's project list) surfaces a
 * non-empty project before the longer telemetry insert kicks off.
 *
 * Activity timeouts: 30 minutes. ClickHouse insertion and derived AI work
 * (Voyage embeddings + taxonomy naming) are the long poles. The cap is
 * generous so a slow provider or shared-infra spike doesn't trip the retry
 * policy.
 *
 * Retry policy: spreads `defaultActivityRetryPolicy` and marks
 * `SeedError` non-retryable. The Postgres seed runner wraps every
 * per-seeder failure in a `SeedError`
 * (`@platform/db-postgres/src/seeds/types.ts`), so the deterministic bugs
 * that actually burn the retry budget (RLS misconfig, scope mistakes,
 * missing repos) fail fast instead of churning for 50h. ClickHouse seeders
 * rethrow raw `Error`s today and still get the full retry chain — that's a
 * known gap; the CH failures we hit in practice are also deterministic
 * (missing fixture key, unmapped id) and would benefit from the same
 * treatment, but wiring SeedError there is a separate refactor. Genuine
 * transient failures across both stores (DB blip, Temporal heartbeat
 * timeout) propagate as plain errors and still get the full chain.
 *
 * TODO: half-seeded failures are accepted for v1 — if any activity
 * errors after exhausting retries, the project row already exists (the
 * use-case created it) but its content is partial. Operators clean up
 * via the existing `softDeleteProject` admin server function.
 */
const { seedDemoProjectPostgresActivity, seedDemoProjectClickHouseActivity, seedDemoProjectTraceSearchActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "30 minutes",
    retry: { ...defaultActivityRetryPolicy, nonRetryableErrorTypes: ["SeedError"] },
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
   * The target org's existing default api key. Threaded through so seeded
   * ClickHouse spans reference a key that actually exists on the org —
   * rather than `SEED_API_KEY_ID` (the canonical seed org's key, invalid
   * on every other org). Picked in the request handler too, before the
   * workflow starts, so replays see a stable value.
   */
  readonly apiKeyId: string
  /**
   * Captured at workflow-start time so both datastores' seeded rows pin to
   * the same "now". A fresh `new Date()` per activity would drift across
   * retries.
   */
  readonly timelineAnchorIso: string
}

export const seedDemoProjectWorkflow = async (input: SeedDemoProjectWorkflowInput) => {
  await seedDemoProjectPostgresActivity(input)
  await seedDemoProjectClickHouseActivity(input)

  // Version gate so workflows already running with the previous two-activity
  // history can finish replaying without scheduling the derived-data steps.
  if (patched("seed-demo-project-derived-search-taxonomy-v1")) {
    await seedDemoProjectTraceSearchActivity(input)
    // Gardening runs through the same Temporal workflow as production; the
    // legacy in-activity orchestrator is gone.
    await executeChild(gardenTaxonomyWorkflow, {
      args: [
        { organizationId: input.organizationId, projectId: input.projectId, dimension: "topic", trigger: "manual" },
      ],
      workflowId: `org:${input.organizationId}:taxonomy:garden:${input.projectId}:seed`,
    })
  }

  return { action: "seeded" as const, projectId: input.projectId }
}
