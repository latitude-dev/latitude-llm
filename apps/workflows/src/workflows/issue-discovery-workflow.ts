import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"

const { checkEligibility, retrieveAndRerank, createOrAssignIssue, syncProjections } = proxyActivities<
  typeof activities
>({ startToCloseTimeout: "5 minutes" })

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

  const retrieval = await retrieveAndRerank(input)

  const assignment = await createOrAssignIssue({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
    matchedIssueId: retrieval.matchedIssueId,
  })

  await syncProjections({ organizationId: input.organizationId, issueId: assignment.issueId })

  return { action: assignment.action, issueId: assignment.issueId }
}
