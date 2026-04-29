import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { runWithLockRetry } from "./lock-retry.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

const { embedScoreFeedback, assignScoreToIssue, syncScoreAnalytics } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: defaultActivityRetryPolicy,
})

export const assignScoreToKnownIssueWorkflow = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly issueId: string
}) => {
  const embeddedScoreFeedback = await embedScoreFeedback({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
  })

  const result = await runWithLockRetry(() =>
    assignScoreToIssue({
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
      issueId: input.issueId,
      normalizedEmbedding: embeddedScoreFeedback.normalizedEmbedding,
    }),
  )

  await syncScoreAnalytics({
    organizationId: input.organizationId,
    scoreId: input.scoreId,
  })

  return { action: result.assignment.action, issueId: result.assignment.issueId }
}
