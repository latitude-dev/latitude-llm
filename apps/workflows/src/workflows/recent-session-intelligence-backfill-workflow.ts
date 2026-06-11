import { executeChild, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { analyzeSessionWorkflow } from "./analyze-session-workflow.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"
import { gardenTaxonomyWorkflow } from "./taxonomy-gardening-workflow.ts"

const DEFAULT_SESSION_CHILD_CONCURRENCY = 10

const {
  listRecentBackfillSessionsActivity,
  resetSessionIntelligenceForSessionsActivity,
  waitForTaxonomyObservationStabilityActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    initialInterval: "30 seconds",
    maximumInterval: "10 minutes",
  },
})

export interface BackfillRecentSessionIntelligenceWorkflowInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionLimit: number
  readonly startedAfter: string
  readonly sessionConcurrency?: number
  readonly gardenAfter?: boolean
}

export interface BackfillRecentSessionIntelligenceWorkflowResult {
  readonly action: "completed"
  readonly sessionsFound: number
}

export const backfillRecentSessionIntelligenceWorkflow = async (
  input: BackfillRecentSessionIntelligenceWorkflowInput,
): Promise<BackfillRecentSessionIntelligenceWorkflowResult> => {
  const sessions = await listRecentBackfillSessionsActivity(input)
  await resetSessionIntelligenceForSessionsActivity({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionIds: sessions.map((session) => session.sessionId),
  })

  const childConcurrency = Math.max(1, input.sessionConcurrency ?? DEFAULT_SESSION_CHILD_CONCURRENCY)
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
          workflowId: `org:${input.organizationId}:conversation-intelligence:recentBackfillAnalyzeSession:${input.projectId}:${session.sessionId}`,
          workflowIdReusePolicy: "ALLOW_DUPLICATE",
        }),
      ),
    )
  }

  if (sessions.length > 0 && input.gardenAfter !== false) {
    await waitForTaxonomyObservationStabilityActivity(input)
    await executeChild(gardenTaxonomyWorkflow, {
      args: [
        { organizationId: input.organizationId, projectId: input.projectId, dimension: "topic", trigger: "manual" },
      ],
      workflowId: `org:${input.organizationId}:taxonomy:garden:${input.projectId}:recent-backfill`,
      workflowIdReusePolicy: "ALLOW_DUPLICATE",
    })
  }

  return { action: "completed", sessionsFound: sessions.length }
}
