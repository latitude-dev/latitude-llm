export type TraceFilterFieldType = "status" | "text" | "multiSelect" | "numberRange"

export interface TraceFilterField {
  readonly field: string
  readonly type: TraceFilterFieldType
  readonly label: string
  readonly placeholder?: string
  readonly tooltip?: string
}

export const TRACE_FILTER_FIELDS = [
  { field: "status", type: "status", label: "Status" },
  { field: "name", type: "text", label: "Name", placeholder: "Enter name..." },
  { field: "sessionId", type: "text", label: "Session ID", placeholder: "Filter by session..." },
  { field: "simulationId", type: "text", label: "Simulation ID", placeholder: "Filter by simulation..." },
  { field: "userId", type: "text", label: "User ID", placeholder: "Filter by user..." },
  { field: "tags", type: "multiSelect", label: "Tags" },
  { field: "models", type: "multiSelect", label: "Models" },
  { field: "providers", type: "multiSelect", label: "Providers" },
  { field: "serviceNames", type: "multiSelect", label: "Services" },
  { field: "duration", type: "numberRange", label: "Duration (ns)" },
  { field: "ttft", type: "numberRange", label: "TTFT (ns)", tooltip: "Time to first token, measured in nanoseconds." },
  { field: "cost", type: "numberRange", label: "Cost (microcents)" },
  { field: "spanCount", type: "numberRange", label: "Span Count" },
  { field: "errorCount", type: "numberRange", label: "Error Count" },
  { field: "tokensInput", type: "numberRange", label: "Tokens Input" },
  { field: "tokensOutput", type: "numberRange", label: "Tokens Output" },
] as const satisfies readonly TraceFilterField[]

export type TraceFilterFieldName = (typeof TRACE_FILTER_FIELDS)[number]["field"]

export const STATUS_OPTIONS = ["ok", "error", "unset"] as const
export type TraceStatus = (typeof STATUS_OPTIONS)[number]
