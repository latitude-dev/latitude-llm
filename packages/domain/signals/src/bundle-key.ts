import type { Score } from "@domain/scores"

/**
 * The exact bucket a score claims, or null when it has none.
 *
 * Only a deterministic detector sets one: it named the failure class itself, so
 * discovery can match on that instead of re-deriving the grouping from an
 * embedding of prose that carries volatile per-occurrence detail. A
 * model-authored judgement has no such class and keeps clustering by meaning.
 *
 * Gated on `SYSTEM` provenance, matching the flagger-metadata guard in the score
 * analytics projection: annotation metadata is writable through the public API, and
 * without the guard a caller could hand-write a key and attach to a detector's bucket.
 */
export const bundleKeyFromScore = (score: Score): string | null =>
  score.sourceType === "annotation" && score.sourceId === "SYSTEM" ? (score.metadata.flaggerBundleKey ?? null) : null
