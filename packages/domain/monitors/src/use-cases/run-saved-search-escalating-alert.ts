import { AlertIncidentRepository, isSavedSearchEntrySignals, type SavedSearchEntrySignals } from "@domain/alerts"
import type { OutboxEventWriter } from "@domain/events"
import { type ChSqlClient, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { countFailingBuckets, maxFailingBuckets } from "../constants.ts"
import type { SavedSearchMatchReader } from "../ports/saved-search-match-reader.ts"
import {
  type EvaluateSavedSearchAlertError,
  type EvaluateSavedSearchAlertInput,
  evaluateSavedSearchEscalatingAlert,
} from "./evaluate-saved-search-alert.ts"
import { closeSavedSearchIncident, openSavedSearchIncident } from "./saved-search-incident-writer.ts"

/**
 * - `opened` — the threshold was sustained across the window (≤ the tolerated
 *   number of failing buckets) and no incident was open; one opened.
 * - `closed` — too many buckets dropped below the frozen threshold; the open
 *   incident closed.
 * - `none`   — no transition this tick.
 */
export interface RunSavedSearchEscalatingAlertResult {
  readonly transition: "opened" | "closed" | "none"
}

export type RunSavedSearchEscalatingAlertError = EvaluateSavedSearchAlertError | RepositoryError

/**
 * `savedSearch.escalating` state machine. The threshold is evaluated per
 * fixed-size bucket tiling `[now - window, now]`; an incident **opens** only when
 * at most {@link maxFailingBuckets} buckets fail the (live) per-bucket threshold —
 * i.e. the elevated rate held across the whole window, not just one spike — and
 * **closes** once more than that many buckets drop below the threshold frozen at
 * open (so the incident's own elevated counts can't drift a multiplier baseline
 * and pin it open). Stateless: one bucketed query per check, no exit dwell.
 */
export const runSavedSearchEscalatingAlertUseCase = (input: EvaluateSavedSearchAlertInput) =>
  Effect.gen(function* () {
    const { organizationId, projectId, alert, now } = input
    const condition = alert.condition
    if (alert.kind !== "savedSearch.escalating" || condition?.kind !== "savedSearch.escalating") {
      return yield* Effect.die(`runSavedSearchEscalatingAlert: not a savedSearch.escalating alert (${alert.id})`)
    }
    const sourceId = alert.source.id
    if (sourceId === null) return yield* Effect.die(`runSavedSearchEscalatingAlert: alert ${alert.id} has no source id`)

    const sqlClient = yield* SqlClient
    const alertIncidentRepository = yield* AlertIncidentRepository

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const evaluation = yield* evaluateSavedSearchEscalatingAlert(input)
        const open = yield* alertIncidentRepository.findOpenByMonitorAlertId(alert.id)
        const maxFail = maxFailingBuckets(evaluation.bucketCounts.length)

        if (open === null) {
          // Open only when (almost) every bucket cleared the live per-bucket threshold.
          const failing = countFailingBuckets(evaluation.bucketCounts, evaluation.perBucketThreshold)
          if (failing > maxFail) return { transition: "none" } satisfies RunSavedSearchEscalatingAlertResult

          const entrySignals: SavedSearchEntrySignals =
            condition.threshold.mode === "multiplier"
              ? {
                  evaluatedThreshold: evaluation.perBucketThreshold,
                  baselineCount: evaluation.baselineCount ?? 0,
                  baseline: condition.threshold.baseline,
                }
              : { evaluatedThreshold: evaluation.perBucketThreshold }
          // Anchor to the start of the sustained window (~now - window); fall back to the window start.
          const startedAt =
            evaluation.firstMatchInWindow ?? new Date(now.getTime() - condition.window.minutes * 60 * 1000)
          yield* openSavedSearchIncident({
            organizationId,
            projectId,
            alert,
            sourceId,
            startedAt,
            endedAt: null,
            entrySignals,
            now,
          })
          return { transition: "opened" } satisfies RunSavedSearchEscalatingAlertResult
        }

        // Maintain while the breach is still sustained against the threshold frozen at entry
        // (fall back to the fresh one for legacy rows without a snapshot); close otherwise.
        const frozenThreshold = isSavedSearchEntrySignals(open.entrySignals)
          ? open.entrySignals.evaluatedThreshold
          : evaluation.perBucketThreshold
        const failing = countFailingBuckets(evaluation.bucketCounts, frozenThreshold)
        if (failing <= maxFail) return { transition: "none" } satisfies RunSavedSearchEscalatingAlertResult

        yield* closeSavedSearchIncident(open, now)
        return { transition: "closed" } satisfies RunSavedSearchEscalatingAlertResult
      }),
    )
  }).pipe(Effect.withSpan("monitors.runSavedSearchEscalatingAlert")) as Effect.Effect<
    RunSavedSearchEscalatingAlertResult,
    RunSavedSearchEscalatingAlertError,
    SqlClient | ChSqlClient | SavedSearchMatchReader | AlertIncidentRepository | OutboxEventWriter
  >
