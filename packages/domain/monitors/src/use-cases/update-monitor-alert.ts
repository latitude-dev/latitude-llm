import {
  ALERT_INCIDENT_KIND_SOURCE_TYPE,
  type AlertIncidentCondition,
  type AlertIncidentKind,
  type AlertIncidentSourceType,
  type AlertSeverity,
  type MonitorAlertId,
  type MonitorId,
  type NotFoundError,
  type RepositoryError,
  SqlClient,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import { AlertConditionMismatchError, MonitorAlertNotFoundError, SystemMonitorForbiddenError } from "../errors.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

/** Kinds that carry no `condition` (nothing to configure). Their condition stays `null`. */
const KINDS_WITHOUT_CONDITION = new Set<AlertIncidentKind>(["issue.new", "issue.regressed", "savedSearch.match"])

const conditionMatchesKind = (condition: AlertIncidentCondition | null, kind: AlertIncidentKind): boolean =>
  condition === null ? KINDS_WITHOUT_CONDITION.has(kind) : condition.kind === kind

export interface UpdateMonitorAlertInput {
  readonly monitorId: MonitorId
  readonly alertId: MonitorAlertId
  /** `kind` is immutable and intentionally absent. Omitted fields keep their current value. */
  readonly source?: { readonly type: AlertIncidentSourceType; readonly id: string | null }
  readonly condition?: AlertIncidentCondition | null
  readonly severity?: AlertSeverity
}

export type UpdateMonitorAlertError =
  | NotFoundError
  | RepositoryError
  | MonitorAlertNotFoundError
  | AlertConditionMismatchError
  | SystemMonitorForbiddenError
  | ValidationError

/**
 * Updates a single existing alert's `source` / `condition` / `severity` in
 * place. `kind` is immutable (and so is `source.type`, which `kind` fixes).
 * The resulting `condition` must be appropriate for the alert's kind.
 *
 * System monitors are structurally locked: only an existing alert's
 * configurable condition values may change — any `source` / `severity` change,
 * or setting a condition on a no-condition kind, is rejected. This is the only
 * alert mutation system monitors permit.
 */
export const updateMonitorAlertUseCase = (
  input: UpdateMonitorAlertInput,
): Effect.Effect<Monitor, UpdateMonitorAlertError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const monitor = yield* repository.findById(input.monitorId)
        const alert = monitor.alerts.find((candidate) => candidate.id === input.alertId)
        if (!alert) {
          return yield* new MonitorAlertNotFoundError({ monitorId: input.monitorId, alertId: input.alertId })
        }

        const nextSource = input.source ?? alert.source
        const nextCondition = input.condition !== undefined ? input.condition : alert.condition
        const nextSeverity = input.severity ?? alert.severity

        // `source.type` is fixed by the (immutable) kind.
        if (nextSource.type !== ALERT_INCIDENT_KIND_SOURCE_TYPE[alert.kind]) {
          return yield* new ValidationError({
            field: "source",
            message: `Source type must be "${ALERT_INCIDENT_KIND_SOURCE_TYPE[alert.kind]}" for ${alert.kind}`,
          })
        }
        if (!conditionMatchesKind(nextCondition, alert.kind)) {
          return yield* new AlertConditionMismatchError({
            message: `Condition does not match alert kind "${alert.kind}"`,
          })
        }

        if (monitor.system) {
          const sourceChanged =
            input.source !== undefined &&
            (input.source.type !== alert.source.type || input.source.id !== alert.source.id)
          const severityChanged = input.severity !== undefined && input.severity !== alert.severity
          const conditionOnNonConfigurable = input.condition !== undefined && alert.condition === null
          if (sourceChanged || severityChanged || conditionOnNonConfigurable) {
            return yield* new SystemMonitorForbiddenError({ monitorId: input.monitorId, operation: "restructured" })
          }
        }

        yield* repository.updateAlert({
          alertId: input.alertId,
          sourceId: nextSource.id,
          condition: nextCondition,
          severity: nextSeverity,
        })
        return {
          ...monitor,
          alerts: monitor.alerts.map((candidate) =>
            candidate.id === input.alertId
              ? { ...candidate, source: nextSource, condition: nextCondition, severity: nextSeverity }
              : candidate,
          ),
        }
      }),
    )
  })
