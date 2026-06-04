import { AlertIncidentRepository, isSavedSearchEntrySignals, type SavedSearchEntrySignals } from "@domain/alerts"
import type { OutboxEventWriter } from "@domain/events"
import { type ChSqlClient, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { SavedSearchMatchReader } from "../ports/saved-search-match-reader.ts"
import {
  type EvaluateSavedSearchAlertError,
  type EvaluateSavedSearchAlertInput,
  evaluateSavedSearchAlert,
} from "./evaluate-saved-search-alert.ts"
import { closeSavedSearchIncident, openSavedSearchIncident } from "./saved-search-incident-writer.ts"

/**
 * - `opened`        — condition met with no open incident; one opened.
 * - `exit-eligible` — condition dropped; the dwell timer started.
 * - `exit-cancelled`— condition returned during the dwell; the timer was cleared.
 * - `closed`        — condition stayed false for the full `window`; the incident closed.
 * - `none`          — no transition this tick.
 */
export interface RunSavedSearchEscalatingAlertResult {
  readonly transition: "opened" | "exit-eligible" | "exit-cancelled" | "closed" | "none"
}

export type RunSavedSearchEscalatingAlertError = EvaluateSavedSearchAlertError | RepositoryError

/**
 * `savedSearch.escalating` state machine, mirroring `issue.escalating` (`window`
 * is both the count window and the exit dwell). The threshold is frozen into
 * `entrySignals` at open time so the incident's own elevated counts can't drift
 * a multiplier baseline and pin it open.
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
        const evaluation = yield* evaluateSavedSearchAlert(input)
        const open = yield* alertIncidentRepository.findOpenByMonitorAlertId(alert.id)

        if (open === null) {
          if (!evaluation.isMet) return { transition: "none" } satisfies RunSavedSearchEscalatingAlertResult
          const entrySignals: SavedSearchEntrySignals =
            condition.threshold.mode === "multiplier"
              ? {
                  evaluatedThreshold: evaluation.threshold,
                  baselineCount: evaluation.baselineCount ?? 0,
                  baseline: condition.threshold.baseline,
                }
              : { evaluatedThreshold: evaluation.threshold }
          const startedAt = evaluation.firstMatchInWindow ?? now
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

        // Compare against the threshold frozen at entry; fall back to the fresh one for legacy rows without a snapshot.
        const frozenThreshold = isSavedSearchEntrySignals(open.entrySignals)
          ? open.entrySignals.evaluatedThreshold
          : evaluation.threshold
        const conditionHolds = evaluation.count >= frozenThreshold

        if (conditionHolds) {
          if (open.exitEligibleSince !== null) {
            yield* alertIncidentRepository.updateExitDwell({ id: open.id, exitEligibleSince: null })
            return { transition: "exit-cancelled" } satisfies RunSavedSearchEscalatingAlertResult
          }
          return { transition: "none" } satisfies RunSavedSearchEscalatingAlertResult
        }

        if (open.exitEligibleSince === null) {
          yield* alertIncidentRepository.updateExitDwell({ id: open.id, exitEligibleSince: now })
          return { transition: "exit-eligible" } satisfies RunSavedSearchEscalatingAlertResult
        }
        const windowMs = condition.window.minutes * 60 * 1000
        if (now.getTime() - open.exitEligibleSince.getTime() >= windowMs) {
          yield* closeSavedSearchIncident(open, now)
          return { transition: "closed" } satisfies RunSavedSearchEscalatingAlertResult
        }
        return { transition: "none" } satisfies RunSavedSearchEscalatingAlertResult
      }),
    )
  }).pipe(Effect.withSpan("monitors.runSavedSearchEscalatingAlert")) as Effect.Effect<
    RunSavedSearchEscalatingAlertResult,
    RunSavedSearchEscalatingAlertError,
    SqlClient | ChSqlClient | SavedSearchMatchReader | AlertIncidentRepository | OutboxEventWriter
  >
