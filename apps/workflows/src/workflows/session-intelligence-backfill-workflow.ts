import { executeChild, patched, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { analyzeSessionWorkflow } from "./analyze-session-workflow.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"
import { gardenTaxonomyWorkflow } from "./taxonomy-gardening-workflow.ts"

const LEGACY_BACKFILL_CHILD_CONCURRENCY = 5
const BACKFILL_CHILD_CONCURRENCY = 10

const {
  listBackfillSessionsActivity,
  resetSessionIntelligenceForProjectActivity,
  resetTaxonomyForProjectActivity,
  waitForTaxonomyObservationStabilityActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    initialInterval: "30 seconds",
    maximumInterval: "10 minutes",
  },
})

export interface BackfillSessionIntelligenceWorkflowInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionLimit: number
  readonly reason: "backoffice"
}

export interface BackfillSessionIntelligenceWorkflowResult {
  readonly action: "completed"
  readonly sessionsFound: number
}

export const backfillSessionIntelligenceWorkflow = async (
  input: BackfillSessionIntelligenceWorkflowInput,
): Promise<BackfillSessionIntelligenceWorkflowResult> => {
  await resetSessionIntelligenceForProjectActivity(input)
  await resetTaxonomyForProjectActivity(input)

  const sessions = await listBackfillSessionsActivity(input)
  const childConcurrency = patched("session-intelligence-backfill-child-concurrency-10-v1")
    ? BACKFILL_CHILD_CONCURRENCY
    : LEGACY_BACKFILL_CHILD_CONCURRENCY

  for (let index = 0; index < sessions.length; index += childConcurrency) {
    const batch = sessions.slice(index, index + childConcurrency)
    await Promise.all(
      batch.map((session) =>
        executeChild(analyzeSessionWorkflow, {
          args: [
            {
              organizationId: input.organizationId,
              projectId: input.projectId,
              sessionId: session.sessionId,
              triggeringTraceId: session.triggeringTraceId,
              triggeringStartTime: session.triggeringStartTime,
              reason: "backfill",
            },
          ],
          workflowId: `org:${input.organizationId}:conversation-intelligence:analyzeSession:${input.projectId}:${session.sessionId}`,
          workflowIdReusePolicy: "ALLOW_DUPLICATE",
        }),
      ),
    )
  }

  if (sessions.length > 0) {
    await waitForTaxonomyObservationStabilityActivity(input)
    await executeChild(gardenTaxonomyWorkflow, {
      args: [
        { organizationId: input.organizationId, projectId: input.projectId, dimension: "topic", trigger: "manual" },
      ],
      workflowId: `org:${input.organizationId}:taxonomy:garden:${input.projectId}:backfill`,
      workflowIdReusePolicy: "ALLOW_DUPLICATE",
    })
  }

  return { action: "completed", sessionsFound: sessions.length }
}
