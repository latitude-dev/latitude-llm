import type { AlertIncidentRepository } from "@domain/alerts"
import type { OutboxEventWriter } from "@domain/events"
import { SavedSearchRepository } from "@domain/saved-searches"
import {
  type ChSqlClient,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SavedSearchId,
  type SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import type { MonitorAlert } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import type { SavedSearchMatchReader } from "../ports/saved-search-match-reader.ts"
import type { EvaluateSavedSearchAlertInput } from "./evaluate-saved-search-alert.ts"
import { runSavedSearchEscalatingAlertUseCase } from "./run-saved-search-escalating-alert.ts"
import { runSavedSearchMatchAlertUseCase } from "./run-saved-search-match-alert.ts"
import { runSavedSearchThresholdAlertUseCase } from "./run-saved-search-threshold-alert.ts"

export interface CheckSavedSearchMonitorsInput {
  readonly organizationId: string
  readonly projectId: string
}

export interface CheckSavedSearchMonitorsResult {
  /** Active saved-search alerts found in the project. */
  readonly evaluated: number
  /** Alerts whose individual evaluation threw (isolated, logged by the caller). */
  readonly failed: number
}

/**
 * Firing orchestrator, run per (org, project) by both trigger paths. Resolves
 * each active saved-search alert's search and dispatches to the kind's state
 * machine. Per-alert failures are isolated + tallied (not propagated) so one bad
 * alert can't trigger an at-least-once retry that re-fires already-fired `match`
 * incidents. Sequential: each alert opens its own transaction.
 */
export const checkSavedSearchMonitorsUseCase = (
  input: CheckSavedSearchMonitorsInput,
): Effect.Effect<
  CheckSavedSearchMonitorsResult,
  RepositoryError,
  | SqlClient
  | ChSqlClient
  | SavedSearchMatchReader
  | AlertIncidentRepository
  | OutboxEventWriter
  | MonitorRepository
  | SavedSearchRepository
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const organizationId = OrganizationId(input.organizationId)
    const projectId = ProjectId(input.projectId)
    const now = new Date()

    const monitorRepository = yield* MonitorRepository
    const savedSearchRepository = yield* SavedSearchRepository
    const alerts = yield* monitorRepository.listActiveSavedSearchAlerts(projectId)

    let failed = 0
    yield* Effect.forEach(
      alerts,
      (alert) =>
        runAlert({ organizationId, projectId, alert, now }).pipe(
          Effect.catch(() =>
            Effect.sync(() => {
              failed += 1
            }),
          ),
        ),
      { concurrency: 1, discard: true },
    )

    yield* Effect.annotateCurrentSpan("evaluated", alerts.length)
    yield* Effect.annotateCurrentSpan("failed", failed)
    return { evaluated: alerts.length, failed }

    function runAlert(args: {
      readonly organizationId: OrganizationId
      readonly projectId: ProjectId
      readonly alert: MonitorAlert
      readonly now: Date
    }) {
      return Effect.gen(function* () {
        const sourceId = args.alert.source.id
        if (sourceId === null) return
        // Skip a since-deleted search (a check can race the delete cascade).
        const search = yield* savedSearchRepository
          .findById(SavedSearchId(sourceId))
          .pipe(Effect.catchTag("SavedSearchNotFoundError", () => Effect.succeed(null)))
        if (search === null) return

        const evalInput: EvaluateSavedSearchAlertInput = {
          organizationId: args.organizationId,
          projectId: args.projectId,
          alert: args.alert,
          target: { query: search.query, filterSet: search.filterSet },
          now: args.now,
        }

        if (args.alert.kind === "savedSearch.match") {
          yield* runSavedSearchMatchAlertUseCase(evalInput)
        } else if (args.alert.kind === "savedSearch.threshold") {
          yield* runSavedSearchThresholdAlertUseCase(evalInput)
        } else if (args.alert.kind === "savedSearch.escalating") {
          yield* runSavedSearchEscalatingAlertUseCase(evalInput)
        }
      })
    }
  }).pipe(Effect.withSpan("monitors.checkSavedSearchMonitors")) as Effect.Effect<
    CheckSavedSearchMonitorsResult,
    RepositoryError,
    | SqlClient
    | ChSqlClient
    | SavedSearchMatchReader
    | AlertIncidentRepository
    | OutboxEventWriter
    | MonitorRepository
    | SavedSearchRepository
  >
