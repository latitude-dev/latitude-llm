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
  { field: "topics", type: "multiSelect", label: "Behaviors", sessionOnly: true },
  { field: "models", type: "multiSelect", label: "Models" },
  { field: "providers", type: "multiSelect", label: "Providers" },
  { field: "serviceNames", type: "multiSelect", label: "Services" },
  { field: "tools", type: "multiSelect", label: "Tools", tooltip: "Traces with at least one call of the tool." },
  {
    field: "definedTools",
    type: "multiSelect",
    label: "Defined tools",
    tooltip: "Traces where the tool was offered to the model, whether or not it was called.",
  },
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
  {
    // Wire value is an integer percentage (0–100), not a 0–1 ratio: the
    // numberRange UI rounds wire values to integers, so a fractional scale
    // would collapse small percentages to 0. The SQL divides by 100.
    field: "cacheHitRate",
    type: "numberRange",
    label: "Cache Hit Rate (%)",
    tooltip: "Share of input tokens served from cache. Low values on large sessions often signal broken caching.",
    displayStep: 1,
  },
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

// ---------------------------------------------------------------------------
// Filter-field allow-list (API/MCP boundary)
// ---------------------------------------------------------------------------
//
// A trace `FilterSet` is keyed by field name, but the wire schema is an open
// record — nothing stops a caller from keying on a field the backend can't
// apply. The ClickHouse filter builder silently drops keys it doesn't
// recognize, so an unrecognized field (e.g. `endTime` misremembered, a typo)
// would return an unfiltered result set with no error. These names let the API
// boundary reject unknown fields instead of silently ignoring them, and let the
// generated SDK/MCP/CLI schemas document exactly what is filterable.

/**
 * Time-window filter fields. A trace's `startTime`/`endTime` are the min span
 * start and max span end. Both are filterable through the API/MCP surface (and
 * `startTime` additionally drives the web time picker); they are intentionally
 * absent from the generic filter dropdown, which handles time via that picker.
 */
export const TRACE_TIME_FILTER_FIELDS = ["startTime", "endTime"] as const

/**
 * Score-derived filter keys, exposed under the `score.` prefix in a trace
 * filter set. Kept in sync with the ClickHouse `SCORE_FIELD_REGISTRY` (guarded
 * by a test in `@platform/db-clickhouse`).
 */
export const SCORE_FILTER_FIELDS = [
  "score.passed",
  "score.errored",
  "score.value",
  "score.source",
  "score.sourceId",
  "score.annotatorId",
  "score.signalId",
  "score.simulationId",
] as const

/**
 * Telemetry (non-score) trace filter field names applicable at the API
 * boundary: the generic non session-only fields plus the time-window fields.
 * Kept in sync with the ClickHouse `TRACE_FIELD_REGISTRY` (guarded by a test in
 * `@platform/db-clickhouse`).
 */
export const TRACE_TELEMETRY_FILTER_FIELDS = [
  ...TRACE_FILTER_FIELDS.filter((f) => !("sessionOnly" in f && f.sessionOnly === true)).map((f) => f.field),
  ...TRACE_TIME_FILTER_FIELDS,
] as const

const TRACE_FILTER_FIELD_NAME_SET: ReadonlySet<string> = new Set([
  ...TRACE_TELEMETRY_FILTER_FIELDS,
  ...SCORE_FILTER_FIELDS,
])

/** Prefix for arbitrary metadata keys (`metadata.<path>`) in a filter set. */
const METADATA_FILTER_FIELD_PREFIX = "metadata."

/** True when `key` is a filter field the trace query can actually apply (registry field, `score.*`, or `metadata.<path>`). */
export const isTraceFilterFieldName = (key: string): boolean =>
  TRACE_FILTER_FIELD_NAME_SET.has(key) ||
  (key.startsWith(METADATA_FILTER_FIELD_PREFIX) && key.length > METADATA_FILTER_FIELD_PREFIX.length)

/** Returns the filter-set keys the trace query cannot apply — empty when every key is valid. */
export const unknownTraceFilterFields = (filters: Readonly<Record<string, unknown>>): string[] =>
  Object.keys(filters).filter((key) => !isTraceFilterFieldName(key))
