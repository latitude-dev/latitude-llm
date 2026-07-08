import { executeChild, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"
import { type SeedDemoProjectWorkflowInput, seedDemoProjectWorkflow } from "./seed-demo-project-workflow.ts"

const {
  assertShowcaseNextQualityActivity,
  markShowcaseNextReadyActivity,
  swapShowcaseActivity,
  enqueueShowcaseCleanupActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  // The quality gate is deterministic — a thin build won't recover on retry, so
  // fail fast instead of burning the retry budget (transient CH/DB errors on the
  // other activities still get the full chain).
  retry: { ...defaultActivityRetryPolicy, nonRetryableErrorTypes: ["ShowcaseQualityGateError"] },
})

/**
 * Regenerates the shared read-only Showcase blue/green (S4). The caller (daily
 * cron worker) has already created the fresh `next` project in the showcase org
 * and marked the pointer `building`; this workflow drives it to live:
 *
 *   build (child seed, re-anchored to now) → gate (mark ready) → atomic swap.
 *
 * The child seed workflow is the same one the per-signup demo used, so the
 * showcase reuses the exact seed content, re-anchored via `timelineAnchorIso`.
 *
 * Failure is not a modeled state: if the seed child fails or the built project
 * is too thin to pass the quality gate, the workflow throws before the swap, so
 * `current` is left untouched and the failure surfaces to Datadog. The half-built
 * `next` is reclaimed by a later run / the cleanup job (S5).
 *
 * After the swap it enqueues the S5 cleanup sweep, which retires the
 * just-swapped-out old `current` (PG soft-delete + `ProjectDeleted`; its
 * ClickHouse telemetry ages out via the retention TTL like any deleted project)
 * without blocking or racing the swap transaction.
 */
export const regenerateShowcaseWorkflow = async (input: SeedDemoProjectWorkflowInput) => {
  await executeChild(seedDemoProjectWorkflow, {
    args: [input],
    workflowId: `showcase:seed:${input.projectId}`,
  })

  await assertShowcaseNextQualityActivity({ organizationId: input.organizationId, projectId: input.projectId })
  await markShowcaseNextReadyActivity()
  await swapShowcaseActivity()
  await enqueueShowcaseCleanupActivity()

  return { action: "regenerated" as const, projectId: input.projectId }
}
