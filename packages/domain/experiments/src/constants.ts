/** Max characters for an experiment name (matches the DB `varchar(128)`). */
export const EXPERIMENT_NAME_MAX_LENGTH = 128
/** Max characters for a variant name. */
export const VARIANT_NAME_MAX_LENGTH = 128
/** Hard ceiling on variants per experiment — bounds the horizontal comparison scroll and the per-read query fan-out. */
export const MAX_VARIANTS_PER_EXPERIMENT = 10

/**
 * The API process shares one ClickHouse client with a small connection pool, so a comparison read
 * must not fan out unbounded onto it. A single comparison caps concurrent in-flight queries at
 * `VARIANT_METRIC_CONCURRENCY * METRIC_QUERY_CONCURRENCY`; keep that product below the pool size so
 * one read can never monopolise the shared sockets and starve other tenants.
 */
export const METRIC_QUERY_CONCURRENCY = 4
/** Max variants whose metric bundles are computed concurrently within one comparison. */
export const VARIANT_METRIC_CONCURRENCY = 2
/** Max experiments whose (heavy) summary metrics are computed concurrently within one list page. */
export const SUMMARY_METRIC_CONCURRENCY = 4
/** Max characters for a variant search query — mirrors the saved-search query limit (`SAVED_SEARCH_QUERY_MAX_LENGTH`). */
export const VARIANT_QUERY_MAX_LENGTH = 500
/** Window an unset variant time range resolves to — the sessions dashboard default (last 30 days). */
export const DEFAULT_VARIANT_RANGE_SECONDS = 30 * 24 * 60 * 60

export const DEFAULT_EXPERIMENTS_PAGE_SIZE = 50
export const MAX_EXPERIMENTS_PAGE_SIZE = 100

/** The comparable entities every variant is measured across. */
export const METRIC_ENTITIES = ["sessions", "users", "tools", "signals", "behaviours"] as const
export type MetricEntity = (typeof METRIC_ENTITIES)[number]

/**
 * Whether a metric moving up is good, bad, or neither. Drives the success/destructive
 * color of a variant's % difference vs the baseline. The codebase has no such flag, so
 * it is defined here: `errorRate`/latency/`cost`/signal-volume are `down-good`,
 * `passRate`/`cacheHitRate`/score-value are `up-good`, and volume/usage metrics are `neutral`.
 */
export type MetricDirection = "up-good" | "down-good" | "neutral"

/** Display unit for a metric value. */
export type MetricUnit = "count" | "percent" | "seconds" | "dollars" | "tokens" | "score" | "days"

export interface ExperimentMetricDef {
  /** Stable key produced by the reader and rendered by the UI, namespaced `<entity>.<metric>`. */
  readonly key: string
  readonly label: string
  /** One-sentence explanation, no trailing period: the UI label tooltip and the public API field description. */
  readonly description: string
  readonly entity: MetricEntity
  readonly unit: MetricUnit
  readonly direction: MetricDirection
  /** One of the four large headline panels on the variant card. */
  readonly headline?: boolean
  /** Rendered only as a headline panel, not repeated in its entity's metric group (e.g. `sessions.users` duplicates `users.distinct`). */
  readonly headlineOnly?: boolean
}

/**
 * The exhaustive catalog of comparable metrics, grouped by entity. The reader computes
 * a value per key (scoped to each variant's population of matching sessions); the UI
 * iterates this catalog to render the fourth card section and the headline panels.
 */
export const EXPERIMENT_METRICS = [
  // Sessions (the population itself). The four headline panels come first.
  {
    key: "sessions.count",
    label: "Sessions",
    description: "Number of sessions in the variant's population",
    entity: "sessions",
    unit: "count",
    direction: "neutral",
    headline: true,
  },
  {
    key: "sessions.users",
    label: "Users",
    description: "Distinct users across the variant's sessions",
    entity: "sessions",
    unit: "count",
    direction: "neutral",
    headline: true,
    headlineOnly: true,
  },
  {
    key: "sessions.cost_total",
    label: "Total cost",
    description: "Total model cost across the variant's sessions",
    entity: "sessions",
    unit: "dollars",
    direction: "down-good",
    headline: true,
  },
  {
    key: "sessions.tokens_total",
    label: "Total tokens",
    description: "Total tokens across the variant's sessions",
    entity: "sessions",
    unit: "tokens",
    direction: "neutral",
  },
  {
    key: "sessions.error_rate",
    label: "Error rate",
    description: "Fraction of sessions with at least one error",
    entity: "sessions",
    unit: "percent",
    direction: "down-good",
  },
  {
    key: "sessions.cache_hit_rate",
    label: "Cache hit rate",
    description: "Fraction of input tokens served from cache",
    entity: "sessions",
    unit: "percent",
    direction: "up-good",
  },
  {
    key: "sessions.duration_median",
    label: "Median duration",
    description: "Median session duration",
    entity: "sessions",
    unit: "seconds",
    direction: "down-good",
    headline: true,
  },
  {
    key: "sessions.duration_p90",
    label: "p90 duration",
    description: "90th-percentile session duration",
    entity: "sessions",
    unit: "seconds",
    direction: "down-good",
  },
  {
    key: "sessions.duration_p95",
    label: "p95 duration",
    description: "95th-percentile session duration",
    entity: "sessions",
    unit: "seconds",
    direction: "down-good",
  },
  {
    key: "sessions.cost_avg",
    label: "Avg cost",
    description: "Average model cost per session",
    entity: "sessions",
    unit: "dollars",
    direction: "down-good",
  },
  {
    key: "sessions.tokens_avg",
    label: "Avg tokens",
    description: "Average tokens per session",
    entity: "sessions",
    unit: "tokens",
    direction: "neutral",
  },
  {
    key: "sessions.ttft_median",
    label: "Median time to first token",
    description: "Median time to first token across sessions",
    entity: "sessions",
    unit: "seconds",
    direction: "down-good",
  },
  {
    key: "sessions.spans_avg",
    label: "Avg spans",
    description: "Average spans per session",
    entity: "sessions",
    unit: "count",
    direction: "neutral",
  },
  {
    key: "sessions.traces_avg",
    label: "Avg traces",
    description: "Average traces per session",
    entity: "sessions",
    unit: "count",
    direction: "neutral",
  },

  // Users (distinct users of the population + per-user rollups).
  {
    key: "users.distinct",
    label: "Users",
    description: "Distinct users in the variant's population",
    entity: "users",
    unit: "count",
    direction: "neutral",
  },
  {
    key: "users.sessions_per_user",
    label: "Avg sessions",
    description: "Average sessions per user",
    entity: "users",
    unit: "count",
    direction: "neutral",
  },
  {
    key: "users.traces_per_user",
    label: "Avg traces",
    description: "Average traces per user",
    entity: "users",
    unit: "count",
    direction: "neutral",
  },
  {
    key: "users.cost_avg",
    label: "Avg cost",
    description: "Average model cost per user",
    entity: "users",
    unit: "dollars",
    direction: "down-good",
  },
  {
    key: "users.duration_median",
    label: "Median duration",
    description: "Median total session time per user",
    entity: "users",
    unit: "seconds",
    direction: "down-good",
  },
  {
    key: "users.duration_p90",
    label: "p90 duration",
    description: "90th-percentile total session time per user",
    entity: "users",
    unit: "seconds",
    direction: "down-good",
  },
  {
    key: "users.duration_p95",
    label: "p95 duration",
    description: "95th-percentile total session time per user",
    entity: "users",
    unit: "seconds",
    direction: "down-good",
  },
  {
    key: "users.error_session_rate",
    label: "Avg error rate",
    description: "Average fraction of a user's sessions that have an error",
    entity: "users",
    unit: "percent",
    direction: "down-good",
  },

  // Tools (execute_tool spans within the population's traces).
  {
    key: "tools.calls",
    label: "Tool calls",
    description: "Total tool calls across the variant's sessions",
    entity: "tools",
    unit: "count",
    direction: "neutral",
  },
  {
    key: "tools.distinct",
    label: "Tools used",
    description: "Distinct tools called",
    entity: "tools",
    unit: "count",
    direction: "neutral",
  },
  {
    key: "tools.sessions_with_tools_rate",
    label: "Usage rate",
    description: "Fraction of sessions that call at least one tool",
    entity: "tools",
    unit: "percent",
    direction: "neutral",
  },
  {
    key: "tools.error_rate",
    label: "Error rate",
    description: "Fraction of tool calls that error",
    entity: "tools",
    unit: "percent",
    direction: "down-good",
  },
  {
    key: "tools.duration_p50",
    label: "Median duration",
    description: "Median tool-call duration",
    entity: "tools",
    unit: "seconds",
    direction: "down-good",
  },
  {
    key: "tools.duration_p90",
    label: "p90 duration",
    description: "90th-percentile tool-call duration",
    entity: "tools",
    unit: "seconds",
    direction: "down-good",
  },
  {
    key: "tools.duration_p95",
    label: "p95 duration",
    description: "95th-percentile tool-call duration",
    entity: "tools",
    unit: "seconds",
    direction: "down-good",
  },

  // Signals (scores carrying a signalId on the population's sessions).
  {
    key: "signals.distinct",
    label: "Signals",
    description: "Distinct signals raised on the variant's sessions",
    entity: "signals",
    unit: "count",
    direction: "down-good",
  },
  {
    key: "signals.occurrences",
    label: "Occurrences",
    description: "Total signal occurrences",
    entity: "signals",
    unit: "count",
    direction: "down-good",
  },
  {
    key: "signals.affected_sessions_rate",
    label: "Affected sessions",
    description: "Fraction of sessions with at least one signal",
    entity: "signals",
    unit: "percent",
    direction: "down-good",
  },
  {
    key: "signals.affected_traces_rate",
    label: "Affected traces",
    description: "Fraction of traces with at least one signal",
    entity: "signals",
    unit: "percent",
    direction: "down-good",
  },
  {
    key: "signals.affected_users",
    label: "Affected users",
    description: "Fraction of users with at least one signal",
    entity: "signals",
    unit: "percent",
    direction: "down-good",
  },
  {
    key: "signals.cost_impact",
    label: "Cost impact",
    description: "Total model cost of sessions carrying a signal",
    entity: "signals",
    unit: "dollars",
    direction: "down-good",
  },

  // Behaviours (taxonomy observations on the population's sessions).
  {
    key: "behaviours.observations",
    label: "Observations",
    description: "Total behaviour observations on the variant's sessions",
    entity: "behaviours",
    unit: "count",
    direction: "neutral",
  },
  {
    key: "behaviours.distinct_clusters",
    label: "Clusters",
    description: "Distinct behaviour clusters observed",
    entity: "behaviours",
    unit: "count",
    direction: "neutral",
  },
  {
    key: "behaviours.moments",
    label: "Moments",
    description: "Semantic moments detected on the variant's sessions",
    entity: "behaviours",
    unit: "count",
    direction: "neutral",
  },
] as const satisfies readonly ExperimentMetricDef[]

export type ExperimentMetricKey = (typeof EXPERIMENT_METRICS)[number]["key"]

/** The four headline metric keys shown as large panels on each variant card. */
export const HEADLINE_METRIC_KEYS = (EXPERIMENT_METRICS as readonly ExperimentMetricDef[])
  .filter((metric) => metric.headline)
  .map((metric) => metric.key as ExperimentMetricKey)

/** The two population metrics gated by the ±25% deviation warning. */
export const DEVIATION_METRIC_KEYS = ["sessions.count", "sessions.users"] as const
/** A variant whose population deviates from the baseline by more than this fraction is flagged. */
export const POPULATION_DEVIATION_THRESHOLD = 0.25

/** Entities whose comparison surfaces a top-N ranked list in addition to scalar metrics. */
export const TOP_LIST_LIMIT = 5

/**
 * Entities that surface a ranked "top N" list alongside their scalar metrics, each keyed to a
 * one-line description (no trailing period): the UI tooltip on the "Top …" row and the public API
 * `top` field.
 */
export const ENTITY_TOP_LIST_DESCRIPTIONS = {
  tools: "Top tools by call count",
  signals: "Top signals by occurrence count",
  behaviours: "Top behaviours by observation count",
} as const satisfies Partial<Record<MetricEntity, string>>
