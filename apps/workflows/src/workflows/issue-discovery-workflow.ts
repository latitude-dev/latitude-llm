import { proxyActivities, sleep } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

const {
  checkEligibility,
  embedScoreFeedback,
  hybridSearchIssues,
  rerankIssueCandidates,
  resolveMatchedIssue,
  finalizeIssueDiscovery,
  assignScoreToIssue,
  syncIssueProjections,
  syncScoreAnalytics,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: defaultActivityRetryPolicy,
})

export const issueDiscoveryWorkflow = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
}) => {
  const eligibility = await checkEligibility(input)
  if (eligibility.status === "skipped") {
    return { action: "skipped" as const, reason: eligibility.reason }
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

  const matchedIssue = await resolveMatchedIssue({
    organizationId: input.organizationId,
    projectId: input.projectId,
    matchedIssueUuid: retrieval.matchedIssueUuid,
  })

  const assignment =
    matchedIssue.issueId === null
      ? await finalizeIssueDiscoveryWithLockRetry({
          organizationId: input.organizationId,
          projectId: input.projectId,
          scoreId: input.scoreId,
          feedback: embeddedScoreFeedback.feedback,
          normalizedEmbedding: embeddedScoreFeedback.normalizedEmbedding,
        })
      : await assignScoreToIssue({
          organizationId: input.organizationId,
          projectId: input.projectId,
          scoreId: input.scoreId,
          issueId: matchedIssue.issueId,
          normalizedEmbedding: embeddedScoreFeedback.normalizedEmbedding,
        })

  await syncIssueProjections({ organizationId: input.organizationId, issueId: assignment.issueId })

  await syncScoreAnalytics({
    organizationId: input.organizationId,
    scoreId: input.scoreId,
  })

  return { action: assignment.action, issueId: assignment.issueId }
}

const FINALIZE_LOCK_RETRY_MAX_ATTEMPTS = 18
const FINALIZE_LOCK_RETRY_INITIAL_DELAY_MS = 1_000
const FINALIZE_LOCK_RETRY_MAX_DELAY_MS = 30_000

const getFinalizeLockRetryDelayMs = (attempt: number) =>
  Math.min(FINALIZE_LOCK_RETRY_INITIAL_DELAY_MS * 2 ** (attempt - 1), FINALIZE_LOCK_RETRY_MAX_DELAY_MS)

const finalizeIssueDiscoveryWithLockRetry = async (input: Parameters<typeof finalizeIssueDiscovery>[0]) => {
  for (let attempt = 1; attempt <= FINALIZE_LOCK_RETRY_MAX_ATTEMPTS; attempt++) {
    const result = await finalizeIssueDiscovery(input)
    if (result.status === "finalized") return result.assignment

    if (attempt < FINALIZE_LOCK_RETRY_MAX_ATTEMPTS) {
      await sleep(getFinalizeLockRetryDelayMs(attempt))
    }
  }

  throw new Error("Issue discovery finalization lock remained unavailable after workflow retries")
}
