import { log, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

export interface AgentScoreSnapshotWorkflowInput {
  readonly organizationId: string
  readonly projectId: string
  readonly date: string
  readonly to?: string
  readonly force?: boolean
}

const { snapshotAgentScoreActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  scheduleToCloseTimeout: "2 hours",
  retry: defaultActivityRetryPolicy,
})

export const agentScoreSnapshotWorkflow = async (input: AgentScoreSnapshotWorkflowInput) => {
  log.info("Agent Score snapshot started", {
    organizationId: input.organizationId,
    projectId: input.projectId,
    date: input.date,
  })
  const result = await snapshotAgentScoreActivity(input)
  log.info("Agent Score snapshot completed", { ...input, result })
  return result
}
