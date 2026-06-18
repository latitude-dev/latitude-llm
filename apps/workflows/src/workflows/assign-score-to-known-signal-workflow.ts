import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { runWithLockRetry } from "./lock-retry.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

const { embedScoreFeedback, assignScoreToSignal, syncScoreAnalytics } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: defaultActivityRetryPolicy,
})

export const assignScoreToKnownSignalWorkflow = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly signalId: string
}) => {
  const embeddedScoreFeedback = await embedScoreFeedback({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
  })

  const result = await runWithLockRetry(() =>
    assignScoreToSignal({
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
      signalId: input.signalId,
      normalizedEmbedding: embeddedScoreFeedback.normalizedEmbedding,
    }),
  )

  await syncScoreAnalytics({
    organizationId: input.organizationId,
    scoreId: input.scoreId,
  })

  return { action: result.assignment.action, signalId: result.assignment.signalId }
}
