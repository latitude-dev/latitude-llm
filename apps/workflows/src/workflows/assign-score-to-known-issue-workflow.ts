import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

const { embedScoreFeedback, assignScoreToIssue, syncIssueProjections, syncScoreAnalytics } = proxyActivities<
  typeof activities
>({
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

  const assignment = await assignScoreToIssue({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
    issueId: input.issueId,
    normalizedEmbedding: embeddedScoreFeedback.normalizedEmbedding,
  })

  await syncIssueProjections({
    organizationId: input.organizationId,
    issueId: assignment.issueId,
  })

  await syncScoreAnalytics({
    organizationId: input.organizationId,
    scoreId: input.scoreId,
  })

  return { action: assignment.action, issueId: assignment.issueId }
}
