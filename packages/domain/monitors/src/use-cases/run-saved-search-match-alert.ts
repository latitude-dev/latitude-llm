import type { AlertIncidentRepository } from "@domain/alerts"
import type { OutboxEventWriter } from "@domain/events"
import { type ChSqlClient, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { SavedSearchMatchReader } from "../ports/saved-search-match-reader.ts"
import {
  type EvaluateSavedSearchAlertError,
  type EvaluateSavedSearchAlertInput,
  evaluateSavedSearchAlert,
} from "./evaluate-saved-search-alert.ts"
import { openSavedSearchIncident } from "./saved-search-incident-writer.ts"

export interface RunSavedSearchMatchAlertResult {
  readonly transition: "fired" | "none"
}

export type RunSavedSearchMatchAlertError = EvaluateSavedSearchAlertError | RepositoryError

/**
 * `savedSearch.match` state machine — no stored state: write one point-in-time
 * incident at the first match. The queue's `throttleMs` is the entire rate limiter.
 */
export const runSavedSearchMatchAlertUseCase = (input: EvaluateSavedSearchAlertInput) =>
  Effect.gen(function* () {
    const { organizationId, projectId, alert, now } = input
    if (alert.kind !== "savedSearch.match") {
      return yield* Effect.die(`runSavedSearchMatchAlert: not a savedSearch.match alert (${alert.id})`)
    }
    const sourceId = alert.source.id
    if (sourceId === null) return yield* Effect.die(`runSavedSearchMatchAlert: alert ${alert.id} has no source id`)

    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const evaluation = yield* evaluateSavedSearchAlert(input)
        if (!evaluation.isMet) return { transition: "none" } satisfies RunSavedSearchMatchAlertResult
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
        return { transition: "fired" } satisfies RunSavedSearchMatchAlertResult
      }),
    )
  }).pipe(Effect.withSpan("monitors.runSavedSearchMatchAlert")) as Effect.Effect<
    RunSavedSearchMatchAlertResult,
    RunSavedSearchMatchAlertError,
    SqlClient | ChSqlClient | SavedSearchMatchReader | AlertIncidentRepository | OutboxEventWriter
  >
