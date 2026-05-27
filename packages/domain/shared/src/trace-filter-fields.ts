export type TraceFilterFieldType = "status" | "text" | "multiSelect" | "numberRange"

export interface TraceFilterField {
  readonly field: string
  readonly type: TraceFilterFieldType
  readonly label: string
  readonly placeholder?: string
  readonly tooltip?: string
  readonly percentile?: boolean // Numeric fields with this flag also support `gtePercentile` filtering
  /**
   * For numberRange fields whose UI unit differs from the wire/storage unit.
   * `wire = display * displayScale` (e.g. dollars → microcents uses 100_000_000).
   * Omit when the UI value is the wire value.
   */
  readonly displayScale?: number
  /**
   * `step` attribute for the numberRange input — the meaningful resolution of
   * the display unit (e.g. 0.01 for dollars, 1 for integer counts). Omit to
   * use HTML's default integer step.
   */
  readonly displayStep?: number
  /** Conversation-intelligence fields are session-scoped; hide them on the traces surface. */
  readonly sessionOnly?: boolean
}

export const TRACE_FILTER_FIELDS = [
  { field: "status", type: "status", label: "Status" },
  { field: "name", type: "text", label: "Name", placeholder: "Enter name..." },
  {
    field: "traceId",
    type: "text",
    label: "Trace ID",
    placeholder: "Filter by trace...",
  },
  {
    field: "sessionId",
    type: "text",
    label: "Session ID",
    placeholder: "Filter by session...",
  },
  {
    field: "simulationId",
    type: "text",
    label: "Simulation ID",
    placeholder: "Filter by simulation...",
  },
  {
    field: "userId",
    type: "text",
    label: "User ID",
    placeholder: "Filter by user...",
  },
  { field: "tags", type: "multiSelect", label: "Tags" },
  { field: "moments", type: "multiSelect", label: "Moments", sessionOnly: true },
  { field: "topics", type: "multiSelect", label: "Topics", sessionOnly: true },
  { field: "models", type: "multiSelect", label: "Models" },
  { field: "providers", type: "multiSelect", label: "Providers" },
  { field: "serviceNames", type: "multiSelect", label: "Services" },
  {
    field: "duration",
    type: "numberRange",
    label: "Duration (seconds)",
    tooltip: "Active execution time, in seconds.",
    percentile: true,
    displayScale: 1_000_000_000,
    displayStep: 0.001,
  },
  {
    field: "ttft",
    type: "numberRange",
    label: "TTFT (milliseconds)",
    tooltip: "Time to first token, in milliseconds.",
    percentile: true,
    displayScale: 1_000_000,
    displayStep: 1,
  },
  {
    field: "cost",
    type: "numberRange",
    label: "Cost ($)",
    tooltip: "Generation cost, in US dollars.",
    percentile: true,
    displayScale: 100_000_000,
    displayStep: 0.01,
  },
  { field: "spanCount", type: "numberRange", label: "Span Count" },
  { field: "errorCount", type: "numberRange", label: "Error Count" },
  { field: "tokensInput", type: "numberRange", label: "Tokens Input" },
  { field: "tokensOutput", type: "numberRange", label: "Tokens Output" },
] as const satisfies readonly TraceFilterField[]

export type TraceFilterFieldName = (typeof TRACE_FILTER_FIELDS)[number]["field"]

/**
 * Conversation-intelligence fields resolved via dedicated subqueries before
 * the generic ClickHouse field registries see the filter set.
 */
export type SessionOnlyFilterFieldName = Extract<(typeof TRACE_FILTER_FIELDS)[number], { sessionOnly: true }>["field"]

/**
 * Trace fields that support `gtePercentile` filtering.
 * Listed explicitly so the union type stays a tight literal — adding a new
 * percentile-eligible field requires touching this list (and the field above
 * with `percentile: true`).
 */
export const PERCENTILE_TRACE_FILTER_FIELDS = ["duration", "ttft", "cost"] as const

export type PercentileTraceFilterField = (typeof PERCENTILE_TRACE_FILTER_FIELDS)[number]

export const isPercentileTraceFilterField = (value: string): value is PercentileTraceFilterField =>
  (PERCENTILE_TRACE_FILTER_FIELDS as readonly string[]).includes(value)

export const PERCENTILE_SESSION_FILTER_FIELDS = ["duration", "ttft", "cost"] as const

export type PercentileSessionFilterField = (typeof PERCENTILE_SESSION_FILTER_FIELDS)[number]

export const isPercentileSessionFilterField = (value: string): value is PercentileSessionFilterField =>
  (PERCENTILE_SESSION_FILTER_FIELDS as readonly string[]).includes(value)

export const STATUS_OPTIONS = ["ok", "error", "unset"] as const
export type TraceStatus = (typeof STATUS_OPTIONS)[number]
