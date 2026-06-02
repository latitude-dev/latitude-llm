import {
  type MonitorAlertId,
  type MonitorId,
  type NotFoundError,
  type RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import { LastMonitorAlertError, MonitorAlertNotFoundError, SystemMonitorForbiddenError } from "../errors.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

export interface DeleteMonitorAlertInput {
  readonly monitorId: MonitorId
  readonly alertId: MonitorAlertId
}

export type DeleteMonitorAlertError =
  | NotFoundError
  | RepositoryError
  | MonitorAlertNotFoundError
  | LastMonitorAlertError
  | SystemMonitorForbiddenError

/**
 * Soft-deletes a single alert (never hard-deleted, so incident history stays
 * attributable). Rejects system monitors (structurally locked) and refuses to
 * remove the monitor's last live alert.
 */
export const deleteMonitorAlertUseCase = (
  input: DeleteMonitorAlertInput,
): Effect.Effect<Monitor, DeleteMonitorAlertError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const monitor = yield* repository.findById(input.monitorId)
        if (monitor.system) {
          return yield* new SystemMonitorForbiddenError({ monitorId: input.monitorId, operation: "restructured" })
        }
        const alert = monitor.alerts.find((candidate) => candidate.id === input.alertId)
        if (!alert) {
          return yield* new MonitorAlertNotFoundError({ monitorId: input.monitorId, alertId: input.alertId })
        }
        if (monitor.alerts.length <= 1) {
          return yield* new LastMonitorAlertError({ monitorId: input.monitorId })
        }
        yield* repository.softDeleteAlert(input.alertId)
        return { ...monitor, alerts: monitor.alerts.filter((candidate) => candidate.id !== input.alertId) }
      }),
    )
  })
