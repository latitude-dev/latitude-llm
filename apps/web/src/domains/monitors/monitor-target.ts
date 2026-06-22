import type { MonitorTarget } from "@domain/monitors"
import type { FilterCondition, FilterSet, MonitorMetric, MonitorStream } from "@domain/shared"

/** The `operation` value tool spans carry; a tool monitor scopes to these `execute_tool` spans. */
const EXECUTE_TOOL_OPERATION = "execute_tool"

const DEFAULT_METRIC: MonitorMetric = { kind: "count" }

const firstEqValue = (conditions: readonly FilterCondition[] | undefined): string | null => {
  const eq = conditions?.find((condition) => condition.op === "eq")
  return typeof eq?.value === "string" ? eq.value : null
}

export const toolMonitorTarget = (toolName: string, metric: MonitorMetric = DEFAULT_METRIC): MonitorTarget => ({
  kind: "tool",
  stream: "spans",
  filterSet: { operation: [{ op: "eq", value: EXECUTE_TOOL_OPERATION }], toolName: [{ op: "eq", value: toolName }] },
  query: null,
  savedSearchId: null,
  metric,
})

export const allToolsMonitorTarget = (metric: MonitorMetric = DEFAULT_METRIC): MonitorTarget => ({
  kind: "tool",
  stream: "spans",
  filterSet: { operation: [{ op: "eq", value: EXECUTE_TOOL_OPERATION }] },
  query: null,
  savedSearchId: null,
  metric,
})

export const userMonitorTarget = (userId: string, metric: MonitorMetric = DEFAULT_METRIC): MonitorTarget => ({
  kind: "user",
  stream: "traces",
  filterSet: { userId: [{ op: "eq", value: userId }] },
  query: null,
  savedSearchId: null,
  metric,
})

export const allUsersMonitorTarget = (metric: MonitorMetric = DEFAULT_METRIC): MonitorTarget => ({
  kind: "user",
  stream: "traces",
  filterSet: {},
  query: null,
  savedSearchId: null,
  metric,
})

export const allSessionsMonitorTarget = (metric: MonitorMetric = DEFAULT_METRIC): MonitorTarget => ({
  kind: "session",
  stream: "sessions",
  filterSet: {},
  query: null,
  savedSearchId: null,
  metric,
})

export const savedSearchMonitorTarget = (
  savedSearchId: string,
  metric: MonitorMetric = DEFAULT_METRIC,
): MonitorTarget => ({
  kind: "savedSearch",
  stream: "traces",
  filterSet: null,
  query: null,
  savedSearchId,
  metric,
})

type TargetDescriptionKind = "tool" | "allTools" | "user" | "allUsers" | "savedSearch" | "allSessions" | "stream"

interface TargetDescription {
  readonly label: string
  readonly kind: TargetDescriptionKind
}

/** Humanise a persisted monitor target into a short chip label for the dashboard's Target column. */
export const describeMonitorTarget = (target: MonitorTarget | null): TargetDescription | null => {
  if (!target) return null
  if (target.kind === "savedSearch") return { label: "Saved search", kind: "savedSearch" }
  const filterSet = target.filterSet ?? {}
  if (target.kind === "tool") {
    const tool = firstEqValue(filterSet.toolName)
    return tool ? { label: `Tool: ${tool}`, kind: "tool" } : { label: "All tools", kind: "allTools" }
  }
  if (target.kind === "user") {
    const user = firstEqValue(filterSet.userId)
    return user ? { label: `User: ${user}`, kind: "user" } : { label: "All users", kind: "allUsers" }
  }
  if (target.kind === "session") return { label: "All sessions", kind: "allSessions" }
  return { label: target.stream, kind: "stream" }
}

interface MonitorMetricOption {
  readonly id: string
  readonly label: string
  readonly metric: MonitorMetric
}

/** Stable select key for a metric ("errorRate", "avg:duration", "sum:cost"). */
export const metricOptionId = (metric: MonitorMetric): string =>
  metric.kind === "count" || metric.kind === "errorRate" ? metric.kind : `${metric.kind}:${metric.field}`

const buildOptions = (options: readonly { label: string; metric: MonitorMetric }[]): readonly MonitorMetricOption[] =>
  options.map((option) => ({ id: metricOptionId(option.metric), ...option }))

const numericMetricOptions = (
  field: "duration" | "cost" | "tokens",
  noun: string,
): readonly { label: string; metric: MonitorMetric }[] => [
  { label: `Total ${noun}`, metric: { kind: "sum", field } },
  { label: `Minimum ${noun}`, metric: { kind: "min", field } },
  { label: `Maximum ${noun}`, metric: { kind: "max", field } },
  { label: `Average ${noun}`, metric: { kind: "avg", field } },
  { label: `Median ${noun}`, metric: { kind: "median", field } },
]

/**
 * The metrics offered when creating a monitor over a target, tailored per stream
 * so the labels and units make sense (latency, not "average duration"; "calls"
 * vs "traces"). Cost/tokens are ~0 on tool spans but offered for completeness.
 */
export const targetMetricOptions = (stream: MonitorStream): readonly MonitorMetricOption[] => {
  if (stream === "spans") {
    return buildOptions([
      { label: "Error rate", metric: { kind: "errorRate" } },
      { label: "Call volume", metric: { kind: "count" } },
      ...numericMetricOptions("duration", "latency"),
      ...numericMetricOptions("cost", "cost"),
      ...numericMetricOptions("tokens", "tokens"),
    ])
  }
  if (stream === "traces") {
    return buildOptions([
      { label: "Error rate", metric: { kind: "errorRate" } },
      { label: "Session volume", metric: { kind: "count" } },
      ...numericMetricOptions("duration", "latency"),
      ...numericMetricOptions("cost", "cost"),
      ...numericMetricOptions("tokens", "tokens"),
    ])
  }
  if (stream === "sessions") {
    return buildOptions([
      { label: "Session volume", metric: { kind: "count" } },
      { label: "Error rate", metric: { kind: "errorRate" } },
      ...numericMetricOptions("duration", "latency"),
      ...numericMetricOptions("cost", "cost"),
      ...numericMetricOptions("tokens", "tokens"),
    ])
  }
  return buildOptions([{ label: "Count", metric: { kind: "count" } }])
}

/** The unit label shown next to an absolute threshold input for a metric. */
export const metricThresholdUnitLabel = (metric: MonitorMetric, stream: MonitorStream): string => {
  if (metric.kind === "errorRate") return "%"
  if (metric.kind === "count") return stream === "spans" ? "calls" : "sessions"
  switch (metric.field) {
    case "duration":
      return "ms"
    case "cost":
      return "$"
    case "tokens":
      return "tokens"
  }
}

export const targetToSessionFilters = (target: MonitorTarget): { filters: FilterSet; query: string | null } => {
  if (target.stream === "spans") {
    const filterSet = target.filterSet ?? {}
    const tool = firstEqValue(filterSet.toolName)
    const filters: Record<string, readonly FilterCondition[]> = {}
    if (tool) filters.tools = [{ op: "in", value: [tool] }]
    return { filters, query: null }
  }
  return { filters: target.filterSet ?? {}, query: target.query }
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
    case "allSessions":
      return "all sessions"
    default:
      return description.label
  }
}
