import type { Score } from "@domain/scores"

/**
 * The exact bucket a score claims, or null when it has none.
 *
 * Only a deterministic detector sets one: it named the failure class itself, so
 * discovery can match on that instead of re-deriving the grouping from an
 * embedding of prose that carries volatile per-occurrence detail. A
 * model-authored judgement has no such class and keeps clustering by meaning.
 */
export const bundleKeyFromScore = (score: Score): string | null =>
  score.sourceType === "annotation" ? (score.metadata.flaggerBundleKey ?? null) : null
