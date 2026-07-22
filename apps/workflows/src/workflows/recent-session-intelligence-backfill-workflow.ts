import { CancellationScope, executeChild, isCancellation, log, patched, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { type AnalyzeSessionWorkflowResult, analyzeSessionWorkflow } from "./analyze-session-workflow.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"
import { gardenTaxonomyWorkflow } from "./taxonomy-gardening-workflow.ts"

const DEFAULT_SESSION_CHILD_CONCURRENCY = 10
const MAX_FAILED_SESSION_IDS = 100

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
  readonly sessionsCompleted: number
  readonly sessionsFailed: number
  readonly failedSessionIds: readonly string[]
  readonly failedSessionIdsTruncated: boolean
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
  const continueAfterChildFailure = patched("recent-session-intelligence-backfill-continue-child-failures-v1")
  const failedSessionIds: string[] = []
  let sessionsCompleted = 0
  let sessionsFailed = 0

  for (let index = 0; index < sessions.length; index += childConcurrency) {
    const batch = sessions.slice(index, index + childConcurrency)
    const executeAnalyzeSession = (session: (typeof sessions)[number]) =>
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
      })

    const classifyResult = (sessionId: string, result: AnalyzeSessionWorkflowResult): boolean => {
      if (result.action !== "recorded" || result.status !== "failed") return true
      log.warn("Session analysis child resolved as failed", {
        organizationId: input.organizationId,
        projectId: input.projectId,
        sessionId,
        status: result.status,
      })
      return false
    }

    const outcomes = continueAfterChildFailure
      ? await Promise.all(
          batch.map(async (session) => {
            try {
              return classifyResult(session.sessionId, await executeAnalyzeSession(session))
            } catch (error) {
              if (isCancellation(error) && CancellationScope.current().consideredCancelled) throw error
              log.warn("Session analysis child execution failed", {
                organizationId: input.organizationId,
                projectId: input.projectId,
                sessionId: session.sessionId,
                reason: error instanceof Error ? error.message : "unknown",
              })
              return false
            }
          }),
        )
      : await Promise.all(
          batch.map(async (session) => classifyResult(session.sessionId, await executeAnalyzeSession(session))),
        )
    sessionsCompleted += outcomes.filter(Boolean).length
    const failedSessions = batch.filter((_, outcomeIndex) => !outcomes[outcomeIndex])
    sessionsFailed += failedSessions.length
    failedSessionIds.push(
      ...failedSessions.slice(0, MAX_FAILED_SESSION_IDS - failedSessionIds.length).map((session) => session.sessionId),
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

  return {
    action: "completed",
    sessionsFound: sessions.length,
    sessionsCompleted,
    sessionsFailed,
    failedSessionIds,
    failedSessionIdsTruncated: sessionsFailed > failedSessionIds.length,
  }
}
