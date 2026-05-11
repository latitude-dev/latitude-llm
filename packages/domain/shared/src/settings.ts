import { Context, Effect } from "effect"
import { z } from "zod"
import { ALERT_INCIDENT_KINDS, type AlertIncidentKind } from "./alert-incident-kinds.ts"
import type { RepositoryError } from "./errors.ts"
import type { ProjectId } from "./id.ts"
import type { SqlClient } from "./sql-client.ts"

export const organizationSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(), // TODO: deprecated. Removed from frontend but maintained to keep cascaded settings scaffold
  billing: z
    .object({
      spendingLimitCents: z.number().int().positive().optional(),
    })
    .optional(),
})

/**
 * Per-alert-kind switch for in-app notifications. Missing entries default to
 * `true` (alert notifications are on by default; users opt out per kind).
 *
 * `escalationSensitivity` (1-6) tunes the seasonal anomaly detector: it's the
 * `k_short` multiplier on σ for the 1h window (the 6h `k_long` is derived as
 * `k_short - 1` so the long window provides independent confirmation). Lower
 * = noisier (trips more easily); higher = quieter. Optional; the detector
 * falls back to `DEFAULT_ESCALATION_SENSITIVITY_K` when missing. Carried on
 * `alertNotifications` because it only matters when at least one kind is
 * enabled.
 *
 * The kind keys (`issue.new` / `issue.regressed` / `issue.escalating`) and
 * the named `escalationSensitivity` key live at the same level — no name
 * collision is possible since the kinds are dotted identifiers.
 */
export const alertNotificationsSettingSchema = z.intersection(
  z.partialRecord(z.enum(ALERT_INCIDENT_KINDS), z.boolean()),
  z.object({
    escalationSensitivity: z.number().int().min(1).max(6).optional(),
  }),
)
export type AlertNotificationsSetting = z.infer<typeof alertNotificationsSettingSchema>

export const projectSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(),
  alertNotifications: alertNotificationsSettingSchema.optional(),
})

export const isAlertNotificationEnabled = (
  settings: ProjectSettings | null | undefined,
  kind: AlertIncidentKind,
): boolean => settings?.alertNotifications?.[kind] ?? true

export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>

export type ProjectSettings = z.infer<typeof projectSettingsSchema>

export type ResolvedSettings = {
  readonly keepMonitoring: boolean
}

const SYSTEM_DEFAULTS: ResolvedSettings = {
  keepMonitoring: true,
}

export function resolveSettingsCascade(input: {
  organization: OrganizationSettings | null
  project?: ProjectSettings | null
}): ResolvedSettings {
  const org = input.organization ?? {}
  const proj = input.project ?? {}

  return {
    keepMonitoring: proj.keepMonitoring ?? org.keepMonitoring ?? SYSTEM_DEFAULTS.keepMonitoring,
  }
}

// Future: evaluationId can be added here
export class SettingsReader extends Context.Service<
  SettingsReader,
  {
    getOrganizationSettings: () => Effect.Effect<OrganizationSettings | null, RepositoryError, SqlClient>
    getProjectSettings: (projectId: ProjectId) => Effect.Effect<ProjectSettings | null, RepositoryError, SqlClient>
  }
>()("@domain/shared/SettingsReader") {}

export const resolveSettings = (input?: { projectId?: ProjectId }) =>
  Effect.gen(function* () {
    const reader = yield* SettingsReader
    const orgSettings = yield* reader.getOrganizationSettings()

    let projectSettings: ProjectSettings | null = null
    if (input?.projectId) {
      projectSettings = yield* reader.getProjectSettings(input.projectId)
    }

    return resolveSettingsCascade({ organization: orgSettings, project: projectSettings })
  })
