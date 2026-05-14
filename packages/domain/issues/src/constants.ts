import type { ScoreSource } from "@domain/scores"

export const ISSUE_NAME_MAX_LENGTH = 128

export const ISSUE_STATES = ["new", "escalating", "ongoing", "resolved", "regressed", "ignored"] as const

export const ISSUE_SOURCES = ["annotation", "flagger", "custom"] as const

export const NEW_ISSUE_AGE_DAYS = 7

/**
 * @deprecated Legacy flat-multiplier factor — removed when the seasonal
 * detector replaces the old use case. Still imported by helpers in
 * `helpers.ts` that are retired in the same change.
 */
export const ESCALATION_THRESHOLD_FACTOR = 1.33

/**
 * Floor used by the seasonal detector's deep-cold-start fallthrough. When
 * fewer than one prior week contributes any data to the relevant
 * dow/hour bucket, the band math has nothing to compare against — the
 * detector falls back to "trip when the absolute count clears this
 * threshold". Same role this constant had before the rewrite (it was the
 * pre-seasonal flat-multiplier floor); kept for the rare genuinely
 * historyless case.
 */
export const ESCALATION_MIN_OCCURRENCES_THRESHOLD = 20

/**
 * Exit hysteresis factor: on exit, the band-shape condition uses
 * `expected + k_exit · σ` with `k_exit = ESCALATION_EXIT_THRESHOLD_FACTOR · k_entry`.
 * The asymmetry between entry and exit `k` (combined with the dwell below)
 * prevents flapping at the band edge once an incident has opened.
 */
export const ESCALATION_EXIT_THRESHOLD_FACTOR = 0.7

/**
 * Default seasonal sensitivity exposed to users as `escalationSensitivity`
 * on `projectSettings.alertNotifications`. Interpreted as `k_short` —
 * the multiplier on σ for the 1h window. `k_long = k_short − 1` for the
 * 6h window so the short-window can prove "now" without the long window
 * dominating it (multi-window-multi-burn-rate SRE pattern). Default 3
 * approximates 99% confidence under a normal assumption.
 */
export const DEFAULT_ESCALATION_SENSITIVITY_K = 3

/**
 * Cold-start guard: when fewer than `MIN_SEASONAL_SAMPLES` of the last
 * `SEASONAL_HISTORY_WEEKS` weeks contributed any data to the relevant
 * bucket, the detector inflates `k_cold = k + 1` instead of running with
 * a noisy σ estimate. Wider bands where we have less evidence; cleaner
 * than a hard floor and stays inside the same algorithm.
 */
export const MIN_SEASONAL_SAMPLES = 2

/**
 * Temporal dwell on exit: the band-shape exit condition must hold
 * continuously for this long before the incident actually closes. Set to
 * roughly 2 evaluation bins at the current ~15-min check cadence. Mirrors
 * Prometheus `keep_firing_for` / Datadog `recovery_window` and prevents
 * single-bin dips from closing an active incident.
 */
export const ESCALATION_EXIT_DWELL_MS = 30 * 60 * 1000

/**
 * Backstop multiplier on the entry-time 24h count: when the live 24h
 * count drops below `entryCount24h * ESCALATION_ABSOLUTE_RATE_EXIT_FACTOR`,
 * the incident force-closes via the `absolute-rate-drop` path regardless
 * of the band shape. Catches the case where the seasonal baseline catches
 * up to a sustained-but-declining incident — bands would say "still high
 * relative to expected" but the absolute volume is half what tripped open.
 */
export const ESCALATION_ABSOLUTE_RATE_EXIT_FACTOR = 0.5

/**
 * Hard ceiling on incident lifetime. Past this, the incident force-closes
 * via the `timeout` path regardless of bands or absolute rate. Matches
 * how Datadog / CloudWatch / GCP Monitoring all guard against ghost
 * incidents that never naturally recover.
 */
export const ESCALATION_MAX_DURATION_MS = 72 * 60 * 60 * 1000

/**
 * Throttle window for the per-issue escalation-state recheck task triggered
 * by `ScoreAssignedToIssue`. Caps the rate of `recentOccurrences`
 * recomputation per issue. Trades off detection latency for compute. While
 * an issue is actively receiving scores, the same use case evaluates exit
 * conditions on every tick; once activity stops, the hourly sweep
 * (`ESCALATION_SWEEPER_PATTERN`) takes over.
 */
export const ESCALATION_CHECK_THROTTLE_MS = 15 * 60 * 1000

/**
 * BullMQ scheduler key for the hourly escalation sweep. Idempotent across
 * worker restarts — re-registering with the same key replaces the existing
 * schedule rather than creating a duplicate.
 */
export const ESCALATION_SWEEPER_KEY = "issues:escalation-sweep"

/**
 * Cron pattern for the hourly escalation sweep — top of every hour, UTC.
 * The sweep finds every open `issue.escalating` incident and enqueues a
 * per-issue `checkEscalation` task. Covers the "burst then silence" case
 * that the per-occurrence triggers cannot catch (no event = no check),
 * provides the cold-start backfill for incidents already stuck, and lets
 * the 72h timeout exit actually fire on long-silent rows.
 */
export const ESCALATION_SWEEPER_PATTERN = "0 * * * *"

// ---------------------------------------------------------------------------
// Centroid configuration
// ---------------------------------------------------------------------------

/**
 * Critical issue-discovery configuration.
 *
 * These values define the persisted `IssueCentroid` space and the query vectors
 * matched against it during issue discovery. Do not change them directly in
 * place: changing model, dimensions, decay semantics, or source weights
 * requires explicit support for old and new embedding spaces plus a centroid
 * rebuild/migration strategy, otherwise historical and new contributions become
 * incompatible.
 */

/** Half-life for exponential decay of centroid contributions, in seconds (14 days). */
export const CENTROID_HALF_LIFE_SECONDS = 14 * 24 * 60 * 60

/** Embedding model used for centroid vectors. */
export const CENTROID_EMBEDDING_MODEL = "voyage-4-large"

/** Embedding dimensionality. */
export const CENTROID_EMBEDDING_DIMENSIONS = 2048

/** Source weights applied when contributing a score embedding to the centroid. */
export const CENTROID_SOURCE_WEIGHTS: Readonly<Record<ScoreSource, number>> = {
  annotation: 1.0,
  evaluation: 0.8,
  custom: 0.8,
} as const

// ---------------------------------------------------------------------------
// Discovery thresholds (hybrid search)
// ---------------------------------------------------------------------------

/** Alpha for Weaviate hybrid search: 75% vector search, 25% keyword search */
export const ISSUE_DISCOVERY_SEARCH_RATIO = 0.75

/** Minimum fused hybrid score to consider a candidate: 80% relevance after vector/BM25 fusion. */
export const ISSUE_DISCOVERY_MIN_SIMILARITY = 0.8

/** Maximum candidates returned from the hybrid search stage. */
export const ISSUE_DISCOVERY_SEARCH_CANDIDATES = 1000

// ---------------------------------------------------------------------------
// Discovery thresholds (rerank)
// ---------------------------------------------------------------------------

/** Maximum candidates sent into the reranking stage. */
export const ISSUE_DISCOVERY_RERANK_CANDIDATES = 25

/** Minimum rerank relevance score required to accept an existing issue match. */
export const ISSUE_DISCOVERY_MIN_RELEVANCE = 0.3

/** Rerank model identifier for issue discovery candidate selection. */
export const ISSUE_DISCOVERY_RERANK_MODEL = "rerank-2.5"

// ---------------------------------------------------------------------------
// Issue details generation
// ---------------------------------------------------------------------------

/** Language model used to generate stable issue names/descriptions. */
export const ISSUE_DETAILS_GENERATION_MODEL = {
  provider: "amazon-bedrock",
  model: "minimax.minimax-m2.5",
  reasoning: "high",
} as const

/** Maximum recent assigned issue occurrences used when regenerating existing issue details. */
export const ISSUE_DETAILS_MAX_OCCURRENCES = 25

// ---------------------------------------------------------------------------
// Issue refresh throttle
// ---------------------------------------------------------------------------

/**
 * Throttle window for issue name/description regeneration (8 hours in
 * milliseconds). Used as `throttleMs` on the `issues:refresh` queue task:
 * the first `ScoreAssignedToIssue` schedules the refresh for `now + 8h`, and
 * subsequent assignments within that window are dropped by BullMQ. Guarantees
 * an upper bound of 8h on refresh latency and at most one refresh per issue
 * per 8h, even under a constant annotation stream.
 */
export const ISSUE_REFRESH_THROTTLE_MS = 8 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Denoising / visibility
// ---------------------------------------------------------------------------

/**
 * Minimum number of linked scores before a non-annotation-backed issue
 * becomes visible in the main Issues UI.
 */
export const MIN_OCCURRENCES_FOR_VISIBILITY = 3

// ---------------------------------------------------------------------------
// Discovery serialization locks
// ---------------------------------------------------------------------------

/**
 * TTL for the outer feedback-scoped serialization lock. Wraps retrieval, AI
 * generation, and the inner project-lock section. Sized to match the
 * activity `startToCloseTimeout` so the lock outlives any single activity
 * run; if a worker dies, Redis auto-deletion never strands the key.
 */
export const ISSUE_DISCOVERY_FEEDBACK_LOCK_TTL_SECONDS = 300

/**
 * TTL for the inner project-scoped serialization lock. Serializes brand-new
 * issue creation per project while a prior worker is still writing the
 * Postgres row and the Weaviate projection. Matches the activity timeout.
 */
export const ISSUE_DISCOVERY_PROJECT_LOCK_TTL_SECONDS = 300

/** Inner project-scoped serialization lock key. */
export const ISSUE_DISCOVERY_PROJECT_LOCK_KEY = "project"

/**
 * Outer feedback-scoped serialization lock key. Takes the SHA-256 hex digest
 * of the canonical feedback string. Hashing serializes identical feedback
 * across all sources without leaking the feedback into Redis keys.
 */
export const ISSUE_DISCOVERY_FEEDBACK_LOCK_KEY = (hash: string) => `feedback:${hash}`

// ---------------------------------------------------------------------------
// Issue update lock
// ---------------------------------------------------------------------------

/**
 * Per-issue serialization lock key. Wraps the assign-score-to-issue Postgres
 * transaction (centroid recompute) and the subsequent Weaviate projection
 * sync so concurrent writers to the same issue do not race on the projection.
 */
export const ISSUE_UPDATE_LOCK_KEY = (issueId: string) => `issue:${issueId}`

/** TTL for the per-issue update serialization lock. Matches the activity timeout. */
export const ISSUE_UPDATE_LOCK_TTL_SECONDS = 300
