import {
  ALERT_INCIDENT_KIND_SOURCE_TYPE,
  type AlertIncidentCondition,
  type AlertIncidentKind,
  type AlertIncidentSourceType,
  type AlertSeverity,
  generateId,
  KINDS_WITHOUT_CONDITION,
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
const NO_CONDITION = new Set<AlertIncidentKind>(KINDS_WITHOUT_CONDITION)

const conditionMatchesKind = (condition: AlertIncidentCondition | null, kind: AlertIncidentKind): boolean =>
  condition === null ? NO_CONDITION.has(kind) : condition.kind === kind

/** Fields a caller supplies to add an alert; `id` / `monitorId` / `createdAt` are generated. */
export interface MonitorAlertInput {
  readonly kind: AlertIncidentKind
  /** Required for legacy source-based kinds; omitted/`null` for unified `event.*`/`metric.*` kinds (target on the monitor). */
  readonly source?: { readonly type: AlertIncidentSourceType; readonly id: string | null } | null
  readonly condition?: AlertIncidentCondition | null
  readonly severity?: AlertSeverity
}

export type BuildMonitorAlertError = ValidationError | AlertConditionMismatchError

/**
 * Validates a user-supplied alert against the creatable-kind rules and
 * materialises it as a `MonitorAlert` for `monitorId`. Used by
 * `createMonitorUseCase` — alerts only come into existence with their monitor.
 * Severity defaults to the kind's canonical severity; condition defaults to
 * `null`. Legacy kinds watch a saved search (`source.id` required); unified
 * `event.*`/`metric.*` kinds carry no source — their target lives on the monitor.
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
    let source: { type: AlertIncidentSourceType; id: string | null } | null
    if (expectedSourceType === undefined) {
      // Unified kind: the target lives on the monitor, so the alert carries no source.
      if (input.source != null) {
        return yield* new ValidationError({ field: "source", message: `Alerts of kind "${input.kind}" take no source` })
      }
      source = null
    } else {
      if (input.source?.type !== expectedSourceType) {
        return yield* new ValidationError({
          field: "source",
          message: `Source type must be "${expectedSourceType}" for ${input.kind}`,
        })
      }
      if (input.source.id === null) {
        return yield* new ValidationError({ field: "source", message: "A saved search must be selected" })
      }
      source = { type: input.source.type, id: input.source.id }
    }
    const condition = input.condition ?? null
    if (!conditionMatchesKind(condition, input.kind)) {
      return yield* new AlertConditionMismatchError({ message: `Condition does not match alert kind "${input.kind}"` })
    }
    return {
      id: MonitorAlertId(generateId()),
      monitorId,
      kind: input.kind,
      source,
      condition,
      severity: input.severity ?? SEVERITY_FOR_KIND[input.kind],
      createdAt: now,
    }
  })
