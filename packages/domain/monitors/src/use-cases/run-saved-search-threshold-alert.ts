import { AlertIncidentRepository } from "@domain/alerts"
import type { OutboxEventWriter } from "@domain/events"
import { type ChSqlClient, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import type { SavedSearchMatchReader } from "../ports/saved-search-match-reader.ts"
import {
  type EvaluateSavedSearchAlertError,
  type EvaluateSavedSearchAlertInput,
  evaluateSavedSearchAlert,
} from "./evaluate-saved-search-alert.ts"
import { openSavedSearchIncident } from "./saved-search-incident-writer.ts"

/**
 * - `fired`  — absolute (one-time) threshold crossed; a point-in-time incident opened.
 * - `opened` — multiplier rising edge; an incident opened and stays open while the spike holds.
 * - `closed` — multiplier condition dropped; the open incident was silently closed (no notification).
 * - `none`   — already spent (absolute), or no transition this tick.
 */
export interface RunSavedSearchThresholdAlertResult {
  readonly transition: "fired" | "opened" | "closed" | "none"
}

export type RunSavedSearchThresholdAlertError = EvaluateSavedSearchAlertError | RepositoryError

/**
 * `savedSearch.threshold` state machine. Absolute mode is one-time (a `FOR UPDATE`
 * lock + prior-incident check absorb retries); multiplier mode rearms via the
 * incident row — one `IncidentCreated` on the rising edge, silent close on drop.
 */
export const runSavedSearchThresholdAlertUseCase = (input: EvaluateSavedSearchAlertInput) =>
  Effect.gen(function* () {
    const { organizationId, projectId, alert, now } = input
    const condition = alert.condition
    if (alert.kind !== "savedSearch.threshold" || condition?.kind !== "savedSearch.threshold") {
      return yield* Effect.die(`runSavedSearchThresholdAlert: not a savedSearch.threshold alert (${alert.id})`)
    }
    const sourceId = alert.source.id
    if (sourceId === null) return yield* Effect.die(`runSavedSearchThresholdAlert: alert ${alert.id} has no source id`)

    const sqlClient = yield* SqlClient
    const monitorRepository = yield* MonitorRepository
    const alertIncidentRepository = yield* AlertIncidentRepository

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        yield* monitorRepository.lockAlertForUpdate(alert.id)

        if (condition.threshold.mode === "absolute") {
          // One-time: any prior incident (open or closed) means the alert is spent.
          const alreadyFired = yield* alertIncidentRepository.existsByMonitorAlertId(alert.id)
          if (alreadyFired) return { transition: "none" } satisfies RunSavedSearchThresholdAlertResult
          const evaluation = yield* evaluateSavedSearchAlert(input)
          if (!evaluation.isMet) return { transition: "none" } satisfies RunSavedSearchThresholdAlertResult
          const startedAt = evaluation.firstMatchInWindow ?? now
          yield* openSavedSearchIncident({
            organizationId,
            projectId,
            alert,
            sourceId,
            startedAt,
            endedAt: startedAt,
            entrySignals: null,
            now,
          })
          return { transition: "fired" } satisfies RunSavedSearchThresholdAlertResult
        }

        // Multiplier: re-evaluate fresh each tick — the alarm already fired on the
        // rising edge, so a sliding baseline drifting it closed is intended.
        const open = yield* alertIncidentRepository.findOpenByMonitorAlertId(alert.id)
        const evaluation = yield* evaluateSavedSearchAlert(input)
        if (open === null && evaluation.isMet) {
          const startedAt = evaluation.firstMatchInWindow ?? now
          yield* openSavedSearchIncident({
            organizationId,
            projectId,
            alert,
            sourceId,
            startedAt,
            endedAt: null,
            entrySignals: null,
            now,
          })
          return { transition: "opened" } satisfies RunSavedSearchThresholdAlertResult
        }
        if (open !== null && !evaluation.isMet) {
          yield* alertIncidentRepository.setEndedAt({ id: open.id, endedAt: now })
          return { transition: "closed" } satisfies RunSavedSearchThresholdAlertResult
        }
        return { transition: "none" } satisfies RunSavedSearchThresholdAlertResult
      }),
    )
  }).pipe(Effect.withSpan("monitors.runSavedSearchThresholdAlert")) as Effect.Effect<
    RunSavedSearchThresholdAlertResult,
    RunSavedSearchThresholdAlertError,
    SqlClient | ChSqlClient | SavedSearchMatchReader | AlertIncidentRepository | OutboxEventWriter | MonitorRepository
  >
