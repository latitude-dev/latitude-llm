import { isTerminalWorkflowStatus, type WorkflowDescription } from "@domain/queue"

export interface AgentScoreComputationRecord {
  readonly date: string
  readonly status: "computing" | "idle"
  readonly marker: string
}

export const toAgentScoreComputationRecord = ({
  date,
  descriptions,
}: {
  readonly date: string
  readonly descriptions: readonly (WorkflowDescription | null)[]
}): AgentScoreComputationRecord => {
  const workflows = descriptions.filter((description): description is WorkflowDescription => description !== null)
  const active = workflows.filter((description) => !isTerminalWorkflowStatus(description.status))
  const candidates = active.length > 0 ? active : workflows
  const latest = [...candidates].sort((left, right) => right.startTime.getTime() - left.startTime.getTime())[0]

  return {
    date,
    status: active.length > 0 ? "computing" : "idle",
    marker: latest ? [latest.runId, latest.status, latest.closeTime?.toISOString() ?? "open"].join(":") : "none",
  }
}
