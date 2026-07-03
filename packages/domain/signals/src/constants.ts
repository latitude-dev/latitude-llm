import type { ScoreSourceType } from "@domain/scores"
import { DEFAULT_ESCALATION_SENSITIVITY } from "@domain/shared"

export const SIGNAL_NAME_MAX_LENGTH = 128

export const SIGNAL_STATES = ["new", "escalating", "ongoing"] as const

export const SIGNAL_SOURCES = ["annotation", "flagger", "custom"] as const

/** Manual triage priority levels, ascending in urgency. Null means "unset". */
export const SIGNAL_PRIORITIES = ["low", "medium", "high", "urgent"] as const

/**
 * Priority groups in display order for the always-grouped issues list.
 * `"none"` is the group for issues with `priority = null` and always sorts
 * last, mirroring how Linear renders a trailing "No priority" section.
 */
export const SIGNAL_PRIORITY_GROUPS = ["urgent", "high", "medium", "low", "none"] as const

/**
 * Sort rank per priority group (lower = earlier in the list). Used as the
 * primary key of the issues-list ordering so rows stay grouped by priority
 * regardless of the user-selected sort, which applies within each group.
 */
export const SIGNAL_PRIORITY_ORDER: Readonly<Record<(typeof SIGNAL_PRIORITY_GROUPS)[number], number>> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
} as const

// ---------------------------------------------------------------------------
// Dimension patterns (Patterns panel)
// ---------------------------------------------------------------------------

/**
 * Minimum trace support before a dimension value is eligible to be ranked as a
 * pattern. The "support" is `totalTraces` — the number of distinct project
 * traces that carry the value (the denominator of its conditional rate). Below
 * this we cannot trust the conditional rate (a value used by two traces, both
 * in the issue, would otherwise post a "100% rate"), so the value is dropped
 * and, when no value clears the gate, the UI shows a "not enough data" state.
 *
 * This single trace-support gate replaces v1's sample/value-count/lift/floor
 * stack: under reverse conditioning the rare-value inflation those guarded
 * against is gated at its source (the denominator), not patched after the fact.
 */
export const SIGNAL_DIMENSION_MIN_SUPPORT = 10

/**
 * Minimum rate-elevation (`conditionalRate − baseRate`, in `[0, 1]`) for a value
 * to be shown as a pattern. At least 1 percentage point more of a value's traces
 * must fall into the issue than traces overall, otherwise it sits too close to
 * the baseline to be worth surfacing. The floor is on the *elevation*, not the
 * conditional rate, so a rare-but-predictive value (e.g. 0.8% conditional over a
 * 0.01% base) still qualifies — its elevation is what matters, not its absolute
 * share. Keeps the (scrollable) list to genuinely over-represented values.
 */
export const SIGNAL_DIMENSION_MIN_RATE_ELEVATION = 0.01

// ---------------------------------------------------------------------------
// Related issues (Related panel)
// ---------------------------------------------------------------------------

/**
 * Useful band of centroid cosine similarity for the Related list's semantic
 * signal, rescaled linearly to a `[0, 1]` score. Below the floor two issues
 * are simply unrelated; at/above the ceiling they are effectively duplicate
 * clusters (discovery would merge a new score into either). Surviving issue
 * pairs sit *below* the discovery merge thresholds by construction
 * (`SIGNAL_DISCOVERY_MIN_*`), so this band is where all the signal lives.
 * Provisional values — calibrate against real data before widening use.
 */
export const SIGNAL_RELATED_SEMANTIC_FLOOR = 0.55
export const SIGNAL_RELATED_SEMANTIC_CEILING = 0.85

/**
 * Minimum sessions shared with the source issue before a candidate's
 * co-occurrence is scored at all. Below this, NPMI is meaningless — one or
 * two coincidental sessions would otherwise post a high score for tiny pairs.
 */
export const SIGNAL_RELATED_MIN_SHARED_SESSIONS = 3

/**
 * Minimum combined relatedness (noisy-OR of the semantic and co-occurrence
 * scores, in `[0, 1]`) for a row to appear in the Related list. Drops
 * candidates that only barely cleared either signal's own gate.
 */
export const SIGNAL_RELATED_MIN_RELATEDNESS = 0.05

/** Maximum rows in the Related list. */
export const SIGNAL_RELATED_LIMIT = 8

/**
 * Candidate pool fetched per signal (pgvector neighbors / co-occurrence
 * candidates) before scoring, gating, and merging down to
 * `SIGNAL_RELATED_LIMIT`.
 */
export const SIGNAL_RELATED_CANDIDATE_LIMIT = 25

/**
 * Window for the co-occurrence signal. Fixed (not wired to a page range
 * selector): co-occurrence is a behavioral "currently travels together"
 * signal, while the semantic signal is lifetime by nature (the centroid is a
 * decayed running sum).
 */
export const SIGNAL_RELATED_COOCCURRENCE_WINDOW_DAYS = 30

export const NEW_SIGNAL_AGE_DAYS = 7

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
 * Default seasonal sensitivity exposed to users as `sensitivity` on
 * `projectSettings.escalation`. Interpreted as `k_short` — the
 * multiplier on σ for the 1h window. `k_long = k_short − 1` for the
 * 6h window so the short-window can prove "now" without the long window
 * dominating it (multi-window-multi-burn-rate SRE pattern). Default 3
 * approximates 99% confidence under a normal assumption. The value is the
 * shared `DEFAULT_ESCALATION_SENSITIVITY` so monitor provisioning and the
 * legacy detector path can't drift apart.
 */
export const DEFAULT_ESCALATION_SENSITIVITY_K = DEFAULT_ESCALATION_SENSITIVITY

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
 * Throttle window for the per-signal escalation-state recheck task triggered
 * by `ScoreAssignedToSignal`. Caps the rate of `recentOccurrences`
 * recomputation per signal. Trades off detection latency for compute. While
 * a signal is actively receiving scores, the same use case evaluates exit
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
 * The sweep finds every open signal incident and enqueues a
 * per-signal `checkEscalation` task. Covers the "burst then silence" case
 * that the per-occurrence triggers cannot catch (no event = no check),
 * provides the cold-start backfill for incidents already stuck, and lets
 * the 72h timeout exit actually fire on long-silent rows.
 */
export const ESCALATION_SWEEPER_PATTERN = "0 * * * *"

// ---------------------------------------------------------------------------
// Centroid configuration
// ---------------------------------------------------------------------------

/**
 * Critical signal-discovery configuration.
 *
 * These values define the persisted `SignalCentroid` space and the query vectors
 * matched against it during signal discovery. Do not change them directly in
 * place: changing model, dimensions, decay semantics, or source weights
 * requires explicit support for old and new embedding spaces plus a centroid
 * rebuild/migration strategy, otherwise historical and new contributions become
 * incompatible.
 */

/** Half-life for exponential decay of centroid contributions, in seconds (14 days). */
export const CENTROID_HALF_LIFE_SECONDS = 14 * 24 * 60 * 60

// The embedding model is resolved at call time via `resolveEmbeddingConfig()`
// (`@domain/ai`): default `voyage-4-large` at the fixed `EMBEDDING_DIMENSIONS`
// (2048), overridable with `LAT_AI_EMBEDDING_{PROVIDER,MODEL}`.

/** Source weights applied when contributing a score embedding to the centroid. */
export const CENTROID_SOURCE_WEIGHTS: Readonly<Record<ScoreSourceType, number>> = {
  annotation: 1.0,
  evaluation: 0.8,
  custom: 0.8,
} as const

// ---------------------------------------------------------------------------
// Discovery thresholds (hybrid search)
// ---------------------------------------------------------------------------

/** Alpha for Postgres pgvector + full-text hybrid search: 75% vector search, 25% keyword search */
export const SIGNAL_DISCOVERY_SEARCH_RATIO = 0.75

/** Minimum fused hybrid score to consider a candidate: 80% relevance after vector/BM25 fusion. */
export const SIGNAL_DISCOVERY_MIN_SIMILARITY = 0.8

/** Minimum semantic similarity to consider a candidate even when lexical overlap is low. */
export const SIGNAL_DISCOVERY_MIN_VECTOR_SIMILARITY = 0.75

/** Maximum candidates returned from the hybrid search stage. */
export const SIGNAL_DISCOVERY_SEARCH_CANDIDATES = 1000

// ---------------------------------------------------------------------------
// Discovery thresholds (rerank)
// ---------------------------------------------------------------------------

// TODO(signal-discovery-rerank): remove these constants with the temporary
// third-party rerank stage once pgvector-only matching is calibrated.

/** Maximum candidates sent into the reranking stage. */
export const SIGNAL_DISCOVERY_RERANK_CANDIDATES = 25

/** Minimum rerank relevance score required to accept an existing issue match. */
export const SIGNAL_DISCOVERY_MIN_RELEVANCE = 0.3

// The rerank model is resolved at call time via `resolveRerankingConfig()`
// (`@domain/ai`): default `rerank-2.5` on Voyage, overridable with
// `LAT_AI_RERANKING_{PROVIDER,MODEL}`.

// ---------------------------------------------------------------------------
// Signal details generation
// ---------------------------------------------------------------------------

/** Language model used to generate stable issue names/descriptions. */
export const SIGNAL_DETAILS_DEFAULT_GENERATION_MODEL = {
  provider: "amazon-bedrock",
  model: "minimax.minimax-m2.5",
  reasoning: "high",
} as const

/** Maximum recent assigned issue occurrences used when regenerating existing issue details. */
export const SIGNAL_DETAILS_MAX_OCCURRENCES = 25

// ---------------------------------------------------------------------------
// Agentic signal generation (describe-first builder)
// ---------------------------------------------------------------------------

/** Language model that drafts complete signals from a natural-language description. Overridable via `LAT_AI_SIGNAL_GENERATOR_*`. */
export const SIGNAL_GENERATION_DEFAULT_MODEL = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-sonnet-4-6",
  reasoning: "medium",
} as const

/** Hard cap on `ai.generate` calls per generation: first draft + repair turns + one review turn. */
export const SIGNAL_GENERATION_MAX_GENERATE_CALLS = 4

/** Distinct values fetched per filter dimension for the generation grounding context. */
export const SIGNAL_GENERATION_DISTINCT_VALUES_LIMIT = 50

// ---------------------------------------------------------------------------
// Signal refresh throttle
// ---------------------------------------------------------------------------

/**
 * Throttle window for issue name/description regeneration (8 hours in
 * milliseconds). Used as `throttleMs` on the `issues:refresh` queue task:
 * the first `ScoreAssignedToSignal` schedules the refresh for `now + 8h`, and
 * subsequent assignments within that window are dropped by BullMQ. Guarantees
 * an upper bound of 8h on refresh latency and at most one refresh per issue
 * per 8h, even under a constant annotation stream.
 */
export const SIGNAL_REFRESH_THROTTLE_MS = 8 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Discovery serialization locks
// ---------------------------------------------------------------------------

/**
 * TTL for the outer feedback-scoped serialization lock. Wraps retrieval, AI
 * generation, and the inner project-lock section. Sized to match the
 * activity `startToCloseTimeout` so the lock outlives any single activity
 * run; if a worker dies, Redis auto-deletion never strands the key.
 */
export const SIGNAL_DISCOVERY_FEEDBACK_LOCK_TTL_SECONDS = 300

/**
 * TTL for the inner project-scoped serialization lock. Serializes brand-new
 * issue creation per project while a prior worker is still writing the
 * Postgres issue row and derived search vector. Matches the activity timeout.
 */
export const SIGNAL_DISCOVERY_PROJECT_LOCK_TTL_SECONDS = 300

/** Inner project-scoped serialization lock key. */
export const SIGNAL_DISCOVERY_PROJECT_LOCK_KEY = "project"

/**
 * Outer feedback-scoped serialization lock key. Takes the SHA-256 hex digest
 * of the canonical feedback string. Hashing serializes identical feedback
 * across all sources without leaking the feedback into Redis keys.
 */
export const SIGNAL_DISCOVERY_FEEDBACK_LOCK_KEY = (hash: string) => `feedback:${hash}`

// ---------------------------------------------------------------------------
// Signal update lock
// ---------------------------------------------------------------------------

/**
 * Per-issue serialization lock key. Wraps the assign-score-to-signal Postgres
 * transaction (centroid recompute plus derived pgvector maintenance) so
 * concurrent writers to the same issue do not race on centroid state.
 */
export const SIGNAL_UPDATE_LOCK_KEY = (signalId: string) => `issue:${signalId}`

/** TTL for the per-issue update serialization lock. Matches the activity timeout. */
export const SIGNAL_UPDATE_LOCK_TTL_SECONDS = 300
