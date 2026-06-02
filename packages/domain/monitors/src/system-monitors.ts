import {
  type AlertIncidentCondition,
  type AlertIncidentKind,
  type AlertIncidentSourceType,
  DEFAULT_ESCALATION_SENSITIVITY,
} from "@domain/shared"

/**
 * Structural definition of a system monitor's alert. `severity` is NOT carried
 * here — it's a pure function of `kind` (`SEVERITY_FOR_KIND`), applied when the
 * provision use-case materialises the entity, so the system monitors and the
 * legacy issue-event path can't report different severities for the same kind.
 */
export interface SystemMonitorAlertDefinition {
  readonly kind: AlertIncidentKind
  readonly source: { readonly type: AlertIncidentSourceType; readonly id: string | null }
  readonly condition: AlertIncidentCondition | null
}

export interface SystemMonitorDefinition {
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly alerts: readonly SystemMonitorAlertDefinition[]
}

/**
 * The three issue-lifecycle monitors every project is provisioned with. Slug,
 * name and alert structure are fixed (system monitors are structurally locked);
 * only `mutedAt` and the predefined alerts' `condition` values are user-editable.
 * Source-type-agnostic by construction — future system monitors of any source
 * type extend this array.
 */
export const SYSTEM_MONITOR_DEFINITIONS: readonly SystemMonitorDefinition[] = [
  {
    slug: "issue-discovered",
    name: "Issue discovered",
    description: "Notifies each time a new issue is detected.",
    alerts: [{ kind: "issue.new", source: { type: "issue", id: null }, condition: null }],
  },
  {
    slug: "issue-regressed",
    name: "Issue regressed",
    description: "Notifies each time a resolved issue is detected again.",
    alerts: [{ kind: "issue.regressed", source: { type: "issue", id: null }, condition: null }],
  },
  {
    slug: "issue-escalating",
    name: "Issue escalating",
    description: "Notifies when an ongoing issue is being detected more than expected.",
    alerts: [
      {
        kind: "issue.escalating",
        source: { type: "issue", id: null },
        // Sensitivity travels with the monitor (moved off projects.settings); the
        // default is provisioned here and stays editable from the details panel.
        condition: { kind: "issue.escalating", sensitivity: DEFAULT_ESCALATION_SENSITIVITY },
      },
    ],
  },
] as const
