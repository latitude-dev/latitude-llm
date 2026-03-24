import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"

const { recheckEligibility, retrieveAndRerank, createOrAssignIssue, syncProjections } = proxyActivities<
  typeof activities
>({ startToCloseTimeout: "5 minutes" })

export const issueDiscoveryWorkflow = async (input: {
  readonly organizationId: string
  readonly scoreId: string
  readonly logFile?: string
}) => {
  const eligibility = await recheckEligibility(input, input.logFile)
  if (!eligibility.eligible) return { action: "skipped" as const, reason: "not-eligible" }

  const retrieval = await retrieveAndRerank(input, input.logFile)

  const assignment = await createOrAssignIssue(
    {
      organizationId: input.organizationId,
      scoreId: input.scoreId,
      matchedIssueId: retrieval.matchedIssueId,
    },
    input.logFile,
  )

  await syncProjections({ organizationId: input.organizationId, issueId: assignment.issueId }, input.logFile)

  return { action: assignment.action, issueId: assignment.issueId }
}
