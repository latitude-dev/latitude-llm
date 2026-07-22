import { executeChild, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { backfillRecentSessionIntelligenceWorkflow } from "./recent-session-intelligence-backfill-workflow.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

const DEFAULT_LOOKBACK_DAYS = 3
const DEFAULT_PROJECT_CONCURRENCY = 2
const DEFAULT_SESSION_CONCURRENCY_PER_PROJECT = 10
const MAX_FAILED_SESSION_IDS = 100

type BackfillChildResult = {
  readonly sessionsFound?: number
  readonly sessionsCompleted?: number
  readonly sessionsFailed?: number
  readonly failedSessionIds?: readonly unknown[]
  readonly failedSessionIdsTruncated?: boolean
}

const { listSessionIntelligenceBackfillProjectsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    initialInterval: "30 seconds",
    maximumInterval: "10 minutes",
  },
})

export interface BackfillRecentSessionIntelligenceForProjectsWorkflowInput {
  readonly sessionLimitPerProject: number
  readonly lookbackDays?: number
  readonly startedAfter?: string
  readonly projectConcurrency?: number
  readonly sessionConcurrencyPerProject?: number
  readonly gardenAfter?: boolean
  readonly organizationId?: string
  readonly projectId?: string
}

export interface BackfillRecentSessionIntelligenceForProjectsWorkflowResult {
  readonly action: "completed"
  readonly projectsFound: number
  readonly sessionsFound: number
  readonly sessionsCompleted: number
  readonly sessionsFailed: number
  readonly failedSessionIds: readonly string[]
  readonly failedSessionIdsTruncated: boolean
}

const startedAfterForInput = (input: BackfillRecentSessionIntelligenceForProjectsWorkflowInput): string => {
  if (input.startedAfter) return input.startedAfter
  const lookbackDays = Math.max(1, input.lookbackDays ?? DEFAULT_LOOKBACK_DAYS)
  return new Date(Date.now() - lookbackDays * 24 * 60 * 60_000).toISOString()
}

export const backfillRecentSessionIntelligenceForProjectsWorkflow = async (
  input: BackfillRecentSessionIntelligenceForProjectsWorkflowInput,
): Promise<BackfillRecentSessionIntelligenceForProjectsWorkflowResult> => {
  const startedAfter = startedAfterForInput(input)
  const projects = await listSessionIntelligenceBackfillProjectsActivity({
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  })

  const projectConcurrency = Math.max(1, input.projectConcurrency ?? DEFAULT_PROJECT_CONCURRENCY)
  const failedSessionIds: string[] = []
  let failedSessionIdsTruncated = false
  let sessionsFound = 0
  let sessionsCompleted = 0
  let sessionsFailed = 0
  for (let index = 0; index < projects.length; index += projectConcurrency) {
    const batch = projects.slice(index, index + projectConcurrency)
    const results = await Promise.all(
      batch.map((project) =>
        executeChild(backfillRecentSessionIntelligenceWorkflow, {
          args: [
            {
              organizationId: project.organizationId,
              projectId: project.projectId,
              sessionLimit: input.sessionLimitPerProject,
              startedAfter,
              sessionConcurrency: input.sessionConcurrencyPerProject ?? DEFAULT_SESSION_CONCURRENCY_PER_PROJECT,
              ...(input.gardenAfter === undefined ? {} : { gardenAfter: input.gardenAfter }),
            },
          ],
          workflowId: `org:${project.organizationId}:conversation-intelligence:recentBackfill:${project.projectId}:${startedAfter}`,
          workflowIdReusePolicy: "ALLOW_DUPLICATE",
        }),
      ),
    )
    for (const result of results) {
      const childResult = result as BackfillChildResult
      const childSessionsFound = childResult.sessionsFound ?? 0
      const childSessionsFailed = childResult.sessionsFailed ?? 0
      sessionsFound += childSessionsFound
      sessionsCompleted += childResult.sessionsCompleted ?? childSessionsFound - childSessionsFailed
      sessionsFailed += childSessionsFailed
      failedSessionIdsTruncated ||= childResult.failedSessionIdsTruncated === true
      if (!Array.isArray(childResult.failedSessionIds)) continue
      for (const sessionId of childResult.failedSessionIds) {
        if (failedSessionIds.length === MAX_FAILED_SESSION_IDS) break
        if (typeof sessionId === "string") failedSessionIds.push(sessionId)
      }
    }
  }

  return {
    action: "completed",
    projectsFound: projects.length,
    sessionsFound,
    sessionsCompleted,
    sessionsFailed,
    failedSessionIds,
    failedSessionIdsTruncated: failedSessionIdsTruncated || sessionsFailed > failedSessionIds.length,
  }
}
