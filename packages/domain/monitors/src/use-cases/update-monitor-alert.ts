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
  USER_CREATABLE_ALERT_KINDS,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import { AlertConditionMismatchError, MonitorAlertNotFoundError, SystemMonitorForbiddenError } from "../errors.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

const USER_CREATABLE = new Set<AlertIncidentKind>(USER_CREATABLE_ALERT_KINDS)
/** Kinds that carry no `condition` (nothing to configure). Their condition stays `null`. */
const KINDS_WITHOUT_CONDITION = new Set<AlertIncidentKind>(["issue.new", "issue.regressed", "savedSearch.match"])

const conditionMatchesKind = (condition: AlertIncidentCondition | null, kind: AlertIncidentKind): boolean =>
  condition === null ? KINDS_WITHOUT_CONDITION.has(kind) : condition.kind === kind

export interface UpdateMonitorAlertInput {
  readonly monitorId: MonitorId
  readonly alertId: MonitorAlertId
  /** Omitted fields keep their current value; a supplied `kind` requires a matching `source`/`condition`. */
  readonly kind?: AlertIncidentKind
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
 * Updates an alert in place. On a user monitor `kind` may change to another user-creatable kind
 * (`source.type` stays fixed by the target kind). System monitors only allow condition-value
 * changes: any `kind`/`source`/`severity` change, or a condition on a no-condition kind, is rejected.
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

        const nextKind = input.kind ?? alert.kind
        const nextSource = input.source ?? alert.source
        const nextCondition = input.condition !== undefined ? input.condition : alert.condition
        const nextSeverity = input.severity ?? alert.severity
        const kindChanged = input.kind !== undefined && input.kind !== alert.kind

        if (nextSource.type !== ALERT_INCIDENT_KIND_SOURCE_TYPE[nextKind]) {
          return yield* new ValidationError({
            field: "source",
            message: `Source type must be "${ALERT_INCIDENT_KIND_SOURCE_TYPE[nextKind]}" for ${nextKind}`,
          })
        }
        if (!conditionMatchesKind(nextCondition, nextKind)) {
          return yield* new AlertConditionMismatchError({
            message: `Condition does not match alert kind "${nextKind}"`,
          })
        }

        if (monitor.system) {
          const sourceChanged =
            input.source !== undefined &&
            (input.source.type !== alert.source.type || input.source.id !== alert.source.id)
          const severityChanged = input.severity !== undefined && input.severity !== alert.severity
          const conditionOnNonConfigurable = input.condition !== undefined && alert.condition === null
          if (kindChanged || sourceChanged || severityChanged || conditionOnNonConfigurable) {
            return yield* new SystemMonitorForbiddenError({ monitorId: input.monitorId, operation: "restructured" })
          }
        } else if (kindChanged && !USER_CREATABLE.has(nextKind)) {
          // Only saved-search kinds are user-owned; `issue.*` are system-only.
          return yield* new ValidationError({ field: "kind", message: `Alerts of kind "${nextKind}" cannot be set` })
        }

        yield* repository.updateAlert({
          alertId: input.alertId,
          kind: nextKind,
          sourceId: nextSource.id,
          condition: nextCondition,
          severity: nextSeverity,
        })
        return {
          ...monitor,
          alerts: monitor.alerts.map((candidate) =>
            candidate.id === input.alertId
              ? { ...candidate, kind: nextKind, source: nextSource, condition: nextCondition, severity: nextSeverity }
              : candidate,
          ),
        }
      }),
    )
  })
