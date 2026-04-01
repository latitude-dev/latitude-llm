import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"

const {
  checkEligibility,
  embedScoreFeedback,
  hybridSearchIssues,
  rerankIssueCandidates,
  createOrAssignIssue,
  syncIssueProjections,
  syncScoreAnalytics,
} = proxyActivities<typeof activities>({ startToCloseTimeout: "5 minutes" })

const eligibilityErrorTags = new Set([
  "ScoreNotFoundForDiscoveryError",
  "ScoreDiscoveryOrganizationMismatchError",
  "ScoreDiscoveryProjectMismatchError",
  "DraftScoreNotEligibleForDiscoveryError",
  "ErroredScoreNotEligibleForDiscoveryError",
  "ScoreAlreadyOwnedByIssueError",
  "MissingScoreFeedbackForDiscoveryError",
  "PassedScoreNotEligibleForDiscoveryError",
])

export const issueDiscoveryWorkflow = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
}) => {
  try {
    await checkEligibility(input)
  } catch (error) {
    const maybeTag = (error as { _tag?: string } | null)?._tag
    if (maybeTag && eligibilityErrorTags.has(maybeTag)) {
      return { action: "skipped" as const, reason: maybeTag }
    }
    throw error
  }

  const embeddedScoreFeedback = await embedScoreFeedback(input)

  const hybridSearch = await hybridSearchIssues({
    organizationId: input.organizationId,
    projectId: input.projectId,
    query: embeddedScoreFeedback.feedback,
    normalizedEmbedding: embeddedScoreFeedback.normalizedEmbedding,
  })

  const retrieval = await rerankIssueCandidates({
    query: embeddedScoreFeedback.feedback,
    candidates: hybridSearch.candidates,
  })

  const assignment = await createOrAssignIssue({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
    matchedIssueId: retrieval.matchedIssueId,
    normalizedEmbedding: embeddedScoreFeedback.normalizedEmbedding,
  })

  await syncScoreAnalytics({
    organizationId: input.organizationId,
    scoreId: input.scoreId,
  })

  await syncIssueProjections({ organizationId: input.organizationId, issueId: assignment.issueId })

  return { action: assignment.action, issueId: assignment.issueId }
}
