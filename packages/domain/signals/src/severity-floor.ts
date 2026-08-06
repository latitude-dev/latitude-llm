import { ALERT_SEVERITIES } from "@domain/shared"
import type { SignalPriority } from "./entities/signal.ts"

/**
 * Minimum level for signals a deterministic detector authored. Where a flagger
 * names the failure class outright, that beats re-inferring it from prose: the
 * rubric's `urgent` tier is defined as leaked personal data or a safety breach,
 * which is exactly what `pii-leakage` matched on.
 *
 * A floor only ever raises — the model may rate higher, never lower — so the
 * outcome stays explainable when someone asks why they were paged. Detectors
 * absent from this map are left entirely to the model; being deterministic is
 * not the same as being severe (`low-cache-hit-rate` is a cost observation).
 *
 * Keyed on `metadata.flaggerSlug`, which flagger-authored scores already carry.
 * `nsfw` sits at `high` rather than `urgent` because its own patterns span
 * explicit, sexual and violent classes at different weights and the matched
 * class does not reach the score; `jailbreaking` because an attempt is not
 * evidence the guardrail actually gave way.
 */
const FLAGGER_SEVERITY_FLOOR: Readonly<Record<string, SignalPriority>> = {
  "pii-leakage": "urgent",
  nsfw: "high",
  jailbreaking: "high",
}

/**
 * Detectors that decide by inspection rather than by asking a model: the output
 * did not parse, the response was empty, a tool call errored, the cache is cold.
 *
 * They get no rating. There is nothing for a model to judge — the check already
 * established what happened — and asking anyway measurably drifts: across the
 * production signals these detectors opened, the rating agreed with human triage
 * on none of them and over-rated seven of eight. Their level comes from volume
 * instead, so one occurrence stays `low` and a spike promotes it.
 *
 * Mirrors `DETERMINISTIC_FLAGGER_SLUGS` in `@domain/flaggers`, which derives from
 * the strategy registry. This package cannot import it — there is no dependency
 * in that direction, and adding one re-resolves the lockfile against the
 * release-age gate — so `apps/workers/src/workers/deterministic-flaggers.test.ts`
 * pins the two lists together from a package that sees both.
 */
const DETERMINISTIC_FLAGGERS: ReadonlySet<string> = new Set([
  "tool-call-errors",
  "output-schema-validation",
  "empty-response",
  "low-cache-hit-rate",
])

export const isDeterministicFlagger = (flaggerSlug: string | undefined): boolean =>
  flaggerSlug !== undefined && DETERMINISTIC_FLAGGERS.has(flaggerSlug)

const rank = (severity: SignalPriority): number => ALERT_SEVERITIES.indexOf(severity)

export const flaggerSeverityFloor = (flaggerSlug: string | undefined): SignalPriority | null => {
  if (flaggerSlug === undefined) return null
  return FLAGGER_SEVERITY_FLOOR[flaggerSlug] ?? null
}

/**
 * Raises `severity` to `floor` when the floor is higher. A null severity (the
 * model omitted it) takes the floor outright; no floor leaves it untouched.
 */
export const applySeverityFloor = (
  severity: SignalPriority | null,
  floor: SignalPriority | null,
): SignalPriority | null => {
  if (floor === null) return severity
  if (severity === null) return floor
  return rank(floor) > rank(severity) ? floor : severity
}
