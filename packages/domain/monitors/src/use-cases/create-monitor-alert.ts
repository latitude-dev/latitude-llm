import {
  ALERT_INCIDENT_KIND_SOURCE_TYPE,
  type AlertIncidentCondition,
  type AlertIncidentKind,
  type AlertIncidentSourceType,
  type AlertSeverity,
  generateId,
  MonitorAlertId,
  type MonitorId,
  SEVERITY_FOR_KIND,
  USER_CREATABLE_ALERT_KINDS,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { MonitorAlert } from "../entities/monitor.ts"
import { AlertConditionMismatchError } from "../errors.ts"

const USER_CREATABLE = new Set<AlertIncidentKind>(USER_CREATABLE_ALERT_KINDS)
/**
 * Kinds that carry no `condition`; their condition stays `null`.
 * TODO(target-on-monitor): add `event.matched` here when unified kinds become user-creatable.
 */
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

/**
 * Validates a user-supplied alert against the creatable-kind rules and
 * materialises it as a `MonitorAlert` for `monitorId`. Used by
 * `createMonitorUseCase` — alerts only come into existence with their monitor.
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
