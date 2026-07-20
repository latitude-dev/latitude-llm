import { type FilterSet, generateId } from "@domain/shared"
import { DEFAULT_VARIANT_RANGE_SECONDS } from "./constants.ts"
import type { ExperimentVariant, VariantTimeRange } from "./entities/experiment.ts"
import type { MetricDeltaValue, ResolvedRange } from "./entities/variant-metrics.ts"

/**
 * Resolve a variant's `timeRange` to a concrete absolute window. Relative ranges resolve
 * against `now` (so they stay live); `null` falls back to the default window. The analytics
 * layer only ever sees `{fromIso, toIso}` — this is the single resolution point.
 */
export const resolveVariantRange = (timeRange: VariantTimeRange, now: Date): ResolvedRange => {
  if (timeRange === null) {
    return {
      fromIso: new Date(now.getTime() - DEFAULT_VARIANT_RANGE_SECONDS * 1000).toISOString(),
      toIso: now.toISOString(),
    }
  }
  if (timeRange.type === "absolute") {
    return { fromIso: timeRange.fromIso, toIso: timeRange.toIso }
  }
  return { fromIso: new Date(now.getTime() - timeRange.seconds * 1000).toISOString(), toIso: now.toISOString() }
}

/**
 * Build the sessions-page search params that pre-apply a variant's population: its `query`,
 * and its `filterSet` merged with a `startTime` gte/lte derived from the resolved time range
 * (the sessions page reads the time window from `filters.startTime`). Backs the card's external link.
 */
export const variantToSessionsSearch = (
  variant: Pick<ExperimentVariant, "filterSet" | "query" | "timeRange">,
  now: Date,
): { tab: "sessions"; query: string; filters: FilterSet } => {
  const range = resolveVariantRange(variant.timeRange, now)
  const filters: FilterSet = {
    ...variant.filterSet,
    startTime: [
      { op: "gte", value: range.fromIso },
      { op: "lte", value: range.toIso },
    ],
  }
  return { tab: "sessions", query: variant.query ?? "", filters }
}

const VARIANT_NAME_LETTERS = 26

/**
 * The first `"Variant A" | "Variant B" | …` name not present in `usedNames`. Fills gaps left by
 * deletions/renames, so with `A`/`C` present (after deleting `B`) the next default is `"Variant B"`,
 * never a duplicate `"Variant C"`. Falls back to a numeric suffix past `Z` (unreachable under
 * `MAX_VARIANTS_PER_EXPERIMENT`).
 */
export const firstAvailableVariantName = (usedNames: ReadonlySet<string>): string => {
  for (let i = 0; i < VARIANT_NAME_LETTERS; i++) {
    const candidate = `Variant ${String.fromCharCode(65 + i)}`
    if (!usedNames.has(candidate)) return candidate
  }
  return `Variant ${usedNames.size + 1}`
}

/**
 * The default name for the next variant added to `existing`: the first positional `"Variant <letter>"`
 * not already used, so the first/baseline variant is `"Variant A"` and letters freed by deletions are
 * reused instead of colliding. The baseline is not named specially — it carries a "BASELINE" badge in
 * the UI, so a distinct name would be redundant.
 */
export const nextDefaultVariantName = (existing: readonly ExperimentVariant[]): string =>
  firstAvailableVariantName(new Set(existing.map((variant) => variant.name)))

/**
 * Build a fresh, empty variant for `existing`. The first variant of an empty experiment becomes
 * the baseline; every variant defaults to a positional `"Variant <letter>"` name.
 */
export const newVariant = (existing: readonly ExperimentVariant[]): ExperimentVariant => ({
  id: generateId(),
  name: nextDefaultVariantName(existing),
  baseline: existing.length === 0,
  filterSet: {},
  query: null,
  timeRange: null,
})

/**
 * Return `variants` with `variantId` as the sole baseline (every other variant's flag cleared).
 * A no-op-safe way to enforce the single-baseline invariant when the user sets a new baseline.
 */
export const withBaseline = (variants: readonly ExperimentVariant[], variantId: string): readonly ExperimentVariant[] =>
  variants.map((variant) => ({ ...variant, baseline: variant.id === variantId }))

/**
 * If `variants` has any entries but no baseline (e.g. the baseline was just removed), promote the
 * first remaining variant to baseline so the single-baseline invariant holds.
 */
export const ensureBaseline = (variants: readonly ExperimentVariant[]): readonly ExperimentVariant[] => {
  if (variants.length === 0 || variants.some((variant) => variant.baseline)) return variants
  return variants.map((variant, index) => ({ ...variant, baseline: index === 0 }))
}

/**
 * The first variant name shared by two variants, or `null` when all names are unique. Enforced at the
 * write boundary (create/update use-cases) rather than on read, so legacy rows with duplicates still load.
 */
export const duplicateVariantName = (variants: readonly ExperimentVariant[]): string | null => {
  const seen = new Set<string>()
  for (const variant of variants) {
    if (seen.has(variant.name)) return variant.name
    seen.add(variant.name)
  }
  return null
}

/**
 * Change of `value` vs `baseline`: a signed fraction, `"up-from-zero"` when the baseline is `0`
 * but the value is positive (an unbounded increase with no finite %), or `null` when incomparable
 * (either is `null`, or the baseline is `0` with a non-positive value).
 */
export const computeDelta = (value: number | null, baseline: number | null): MetricDeltaValue | null => {
  if (value === null || baseline === null) return null
  if (baseline === 0) return value > 0 ? "up-from-zero" : null
  return (value - baseline) / baseline
}

/**
 * Whether a search query has a semantic (non-lexical) component. Literal (`"…"`) and ordered-token
 * (`` `…` ``) phrases are exact; anything left over is a semantic prompt, which makes the resolved
 * population a best-effort ranked sample rather than an exact set (see the card's "approximate" caveat).
 */
export const queryHasSemanticComponent = (query: string | null): boolean => {
  if (!query) return false
  const withoutPhrases = query.replace(/"[^"]*"/g, " ").replace(/`[^`]*`/g, " ")
  return withoutPhrases.trim().length > 0
}
