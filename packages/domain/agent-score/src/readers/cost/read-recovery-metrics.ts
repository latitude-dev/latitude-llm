import { marginalCriticalPathNs, type SessionGenerationFact, type TraceCriticalPath } from "@domain/spans"
import type { CostMetricReading, CostReadingBase } from "../../entities/cost-metric-reading.ts"
import { notApplicableReading, unreadableReading } from "../../entities/cost-metric-reading.ts"
import type { AttributableSpendClaim } from "./read-recoverable-spend.ts"

const RECOVERED_INCIDENT_BASE = {
  metricId: "recovery.recovered_incident_rate",
  family: "recovery",
  rawUnit: "completedSessions",
  aggregation: "eventRate",
} as const satisfies CostReadingBase

/**
 * One provider or tool incident the session went on to recover from.
 *
 * `retrySpanIds` are the generations that only existed to get past the incident — the retries, not
 * the failed call. That distinction is the whole point: a failed generation that produced nothing
 * usable was still billed, but what the session *wasted* is the work it had to redo, and the
 * spans that redid it are the ones a counterfactual can remove.
 */
export interface RecoveredIncident {
  readonly traceId: string
  readonly spanId: string
  readonly kind: string
  readonly retrySpanIds: readonly string[]
}

export interface TerminalIncident {
  readonly traceId: string
  readonly spanId: string
  readonly kind: string
}

/**
 * `recovery.recovered_incident_rate` — completed sessions carrying a recovered incident.
 *
 * A session-grained rate: one session either paid a recovery burden or it did not, so the
 * denominator is the session itself. An incomplete session is unreadable rather than clean, and a
 * session that never completed is not applicable — recovery only means something once there is a
 * result to have recovered into.
 */
export const readRecoveredIncidentRate = ({
  completed,
  recovered,
}: {
  readonly completed: boolean | null
  readonly recovered: readonly RecoveredIncident[]
}): CostMetricReading => {
  if (completed === null) return unreadableReading(RECOVERED_INCIDENT_BASE, ["missingContent"], 1)
  if (!completed) return notApplicableReading(RECOVERED_INCIDENT_BASE)

  const adverse = recovered.length > 0 ? 1 : 0
  return {
    ...RECOVERED_INCIDENT_BASE,
    applicability: "applicable",
    readability: "readable",
    rawValue: adverse,
    eligibleUnits: 1,
    adverseUnits: adverse,
    observations: [{ atomId: "session:completed", eligibleUnits: 1, adverseUnits: adverse }],
    evidence: "confirmed",
    nativeImpact: { unit: "completedSessions", point: adverse },
    limitations: [],
  }
}

/**
 * The spend a recovery cost, as claims against the retry generations.
 *
 * Only the retries are claimed. A terminal incident is a Reliability or Outcome endpoint and
 * contributes nothing here: charging its failed span's whole cost to Cost as well would bill one
 * incident to two dimensions, and the session did not spend that money *avoidably* — it spent it
 * failing, which is what Reliability already measures.
 */
export const recoverySpendClaims = ({
  recovered,
  generations,
}: {
  readonly recovered: readonly RecoveredIncident[]
  readonly generations: readonly SessionGenerationFact[]
}): AttributableSpendClaim[] => {
  const billedBySpanId = new Map(
    generations.map((generation) => [generation.spanId as string, generation.costTotalMicrocents]),
  )
  return recovered.flatMap((incident) =>
    incident.retrySpanIds.flatMap((spanId) => {
      const exactMicrocents = billedBySpanId.get(spanId)
      return exactMicrocents === undefined ? [] : [{ spanId, cause: `recovered:${incident.kind}`, exactMicrocents }]
    }),
  )
}

/**
 * The critical-path time a recovery cost, capped by what the retries actually held on the path.
 *
 * Time a retry spent off the critical path — running beside other work the session was waiting on
 * anyway — was never user-visible, so removing the retry would not have returned it.
 */
export const recoveryAvoidableNs = ({
  recovered,
  paths,
}: {
  readonly recovered: readonly RecoveredIncident[]
  readonly paths: readonly TraceCriticalPath[]
}): number => {
  const pathsByTrace = new Map(paths.map((path) => [path.traceId, path]))
  const claimed = new Set<string>()
  let avoidableNs = 0

  for (const incident of recovered) {
    const path = pathsByTrace.get(incident.traceId)
    if (!path || path.completeness === "notApplicable") continue
    for (const spanId of incident.retrySpanIds) {
      const key = `${incident.traceId} ${spanId}`
      if (claimed.has(key)) continue
      claimed.add(key)
      avoidableNs += marginalCriticalPathNs({ path, spanId })
    }
  }

  return avoidableNs
}
