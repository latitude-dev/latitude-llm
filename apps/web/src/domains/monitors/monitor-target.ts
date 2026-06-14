import type { MonitorTarget } from "@domain/monitors"
import type { FilterCondition, MonitorMetric } from "@domain/shared"

/** The `operation` value tool spans carry; a tool monitor scopes to these `execute_tool` spans. */
const EXECUTE_TOOL_OPERATION = "execute_tool"

const DEFAULT_METRIC: MonitorMetric = { kind: "count" }

const firstEqValue = (conditions: readonly FilterCondition[] | undefined): string | null => {
  const eq = conditions?.find((condition) => condition.op === "eq")
  return typeof eq?.value === "string" ? eq.value : null
}

export const toolMonitorTarget = (toolName: string, metric: MonitorMetric = DEFAULT_METRIC): MonitorTarget => ({
  stream: "spans",
  filterSet: { operation: [{ op: "eq", value: EXECUTE_TOOL_OPERATION }], toolName: [{ op: "eq", value: toolName }] },
  query: null,
  savedSearchId: null,
  metric,
})

export const allToolsMonitorTarget = (metric: MonitorMetric = DEFAULT_METRIC): MonitorTarget => ({
  stream: "spans",
  filterSet: { operation: [{ op: "eq", value: EXECUTE_TOOL_OPERATION }] },
  query: null,
  savedSearchId: null,
  metric,
})

export const userMonitorTarget = (userId: string, metric: MonitorMetric = DEFAULT_METRIC): MonitorTarget => ({
  stream: "traces",
  filterSet: { userId: [{ op: "eq", value: userId }] },
  query: null,
  savedSearchId: null,
  metric,
})

export const allUsersMonitorTarget = (metric: MonitorMetric = DEFAULT_METRIC): MonitorTarget => ({
  stream: "traces",
  filterSet: {},
  query: null,
  savedSearchId: null,
  metric,
})

type TargetDescriptionKind = "tool" | "allTools" | "user" | "allUsers" | "savedSearch" | "stream"

interface TargetDescription {
  readonly label: string
  readonly kind: TargetDescriptionKind
}

/** Humanise a persisted monitor target into a short chip label for the dashboard's Target column. */
export const describeMonitorTarget = (target: MonitorTarget | null): TargetDescription | null => {
  if (!target) return null
  if (target.savedSearchId) return { label: "Saved search", kind: "savedSearch" }
  const filterSet = target.filterSet ?? {}
  if (target.stream === "spans") {
    const tool = firstEqValue(filterSet.toolName)
    return tool ? { label: `Tool: ${tool}`, kind: "tool" } : { label: "All tools", kind: "allTools" }
  }
  if (target.stream === "traces") {
    const user = firstEqValue(filterSet.userId)
    return user ? { label: `User: ${user}`, kind: "user" } : { label: "All users", kind: "allUsers" }
  }
  return { label: target.stream, kind: "stream" }
}

/** Longer noun phrase for the alert preview sentence ("the `search` tool", "all users"). */
export const monitorTargetName = (target: MonitorTarget | null): string | undefined => {
  const description = describeMonitorTarget(target)
  if (!description) return undefined
  switch (description.kind) {
    case "tool":
      return `the \`${description.label.slice("Tool: ".length)}\` tool`
    case "allTools":
      return "all tools"
    case "user":
      return `user ${description.label.slice("User: ".length)}`
    case "allUsers":
      return "all users"
    default:
      return description.label
  }
}
