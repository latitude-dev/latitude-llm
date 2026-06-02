import {
  ALERT_INCIDENT_KIND_SOURCE_TYPE,
  type AlertIncidentCondition,
  type AlertIncidentKind,
  type AlertIncidentSourceType,
  type AlertSeverity,
  generateId,
  MonitorAlertId,
  type MonitorId,
  type NotFoundError,
  type RepositoryError,
  SEVERITY_FOR_KIND,
  SqlClient,
  USER_CREATABLE_ALERT_KINDS,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Monitor, MonitorAlert } from "../entities/monitor.ts"
import { AlertConditionMismatchError, SystemMonitorForbiddenError } from "../errors.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

const USER_CREATABLE = new Set<AlertIncidentKind>(USER_CREATABLE_ALERT_KINDS)
/** Kinds that carry no `condition`; their condition stays `null`. */
const KINDS_WITHOUT_CONDITION = new Set<AlertIncidentKind>(["issue.new", "issue.regressed", "savedSearch.match"])

const conditionMatchesKind = (condition: AlertIncidentCondition | null, kind: AlertIncidentKind): boolean =>
  condition === null ? KINDS_WITHOUT_CONDITION.has(kind) : condition.kind === kind

/** Fields a caller supplies to add an alert; `id` / `monitorId` / `createdAt` are generated. */
export interface MonitorAlertInput {
  readonly kind: AlertIncidentKind
  readonly source: { readonly type: AlertIncidentSourceType; readonly id: string | null }
  readonly condition?: AlertIncidentCondition | null
  readonly severity?: AlertSeverity
}

export type BuildMonitorAlertError = ValidationError | AlertConditionMismatchError

export interface CreateMonitorAlertInput extends MonitorAlertInput {
  readonly monitorId: MonitorId
}

export type CreateMonitorAlertError =
  | NotFoundError
  | RepositoryError
  | ValidationError
  | AlertConditionMismatchError
  | SystemMonitorForbiddenError

/**
 * Validates a user-supplied alert against the creatable-kind rules and
 * materialises it as a `MonitorAlert` for `monitorId`. Shared by
 * `createMonitorUseCase` (one per alert) and `createMonitorAlertUseCase`.
 * Severity defaults to the kind's canonical severity; condition defaults to
 * `null`. Every user-creatable kind watches a saved search, so `source.id`
 * (the saved search) is required.
 */
export const buildMonitorAlert = (
  input: MonitorAlertInput,
  monitorId: MonitorId,
  now: Date,
): Effect.Effect<MonitorAlert, BuildMonitorAlertError> =>
  Effect.gen(function* () {
    if (!USER_CREATABLE.has(input.kind)) {
      return yield* new ValidationError({ field: "kind", message: `Alerts of kind "${input.kind}" cannot be created` })
    }
    const expectedSourceType = ALERT_INCIDENT_KIND_SOURCE_TYPE[input.kind]
    if (input.source.type !== expectedSourceType) {
      return yield* new ValidationError({
        field: "source",
        message: `Source type must be "${expectedSourceType}" for ${input.kind}`,
      })
    }
    if (input.source.id === null) {
      return yield* new ValidationError({ field: "source", message: "A saved search must be selected" })
    }
    const condition = input.condition ?? null
    if (!conditionMatchesKind(condition, input.kind)) {
      return yield* new AlertConditionMismatchError({ message: `Condition does not match alert kind "${input.kind}"` })
    }
    return {
      id: MonitorAlertId(generateId()),
      monitorId,
      kind: input.kind,
      source: { type: input.source.type, id: input.source.id },
      condition,
      severity: input.severity ?? SEVERITY_FOR_KIND[input.kind],
      createdAt: now,
    }
  })

/**
 * Adds a single alert to an existing user monitor. Enforces the
 * user-creatable allowlist, kind/source-type match, and a required saved-search
 * source. Rejects system monitors — they're structurally locked, so no alert
 * may be added to one.
 */
export const createMonitorAlertUseCase = (
  input: CreateMonitorAlertInput,
): Effect.Effect<Monitor, CreateMonitorAlertError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const monitor = yield* repository.findById(input.monitorId)
        if (monitor.system) {
          return yield* new SystemMonitorForbiddenError({ monitorId: input.monitorId, operation: "restructured" })
        }
        const alert = yield* buildMonitorAlert(input, input.monitorId, new Date())
        yield* repository.insertAlert(alert)
        return { ...monitor, alerts: [...monitor.alerts, alert] }
      }),
    )
  })
