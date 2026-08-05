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
