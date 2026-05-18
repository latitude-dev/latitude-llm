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
 * Per-alert-kind switch for incident notifications. Missing entries
 * default to `true` (notifications are on by default; users opt out per
 * kind, per project). Built from `ALERT_INCIDENT_KINDS` so adding a new
 * alert kind automatically extends the schema.
 *
 * Modelled as a plain `z.object` rather than a record intersection
 * because `z.record(z.enum(...))` validates keys against the enum and is
 * needlessly strict here — we want explicit per-key types.
 */
const incidentNotificationsKindShape = Object.fromEntries(
  ALERT_INCIDENT_KINDS.map((kind) => [kind, z.boolean().optional()] as const),
) as { [K in AlertIncidentKind]: z.ZodOptional<z.ZodBoolean> }

export const incidentNotificationsSettingSchema = z.object(incidentNotificationsKindShape)
export type IncidentNotificationsSetting = z.infer<typeof incidentNotificationsSettingSchema>

/**
 * Project-level "should this notification be requested at all" settings,
 * keyed by `NotificationGroup`. Mirrors the user-prefs structure
 * (`users.notification_preferences.<group>`); the per-group inner shape
 * varies by what's useful at the project level — for `incidents`, it's a
 * per-alert-kind opt-out matrix (different alert kinds have different
 * signal-to-noise ratios).
 *
 * Future groups (`wrapped_reports`, etc.) get their own slot.
 */
export const notificationsSettingSchema = z.object({
  incidents: incidentNotificationsSettingSchema.optional(),
})
export type NotificationsSetting = z.infer<typeof notificationsSettingSchema>

/**
 * Detector-tuning parameters. Separate from `notifications` because
 * `sensitivity` is not a notification toggle — it's the `k_short`
 * multiplier on σ for the seasonal escalation detector's 1h window
 * (the 6h `k_long` is derived as `k_short - 1`). Lower = noisier (trips
 * more easily); higher = quieter. Optional; the detector falls back to
 * `DEFAULT_ESCALATION_SENSITIVITY_K` when missing. Affects detector
 * behaviour regardless of notification state.
 */
export const escalationSettingSchema = z.object({
  sensitivity: z.number().int().min(1).max(6).optional(),
})
export type EscalationSetting = z.infer<typeof escalationSettingSchema>

export const projectSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(),
  notifications: notificationsSettingSchema.optional(),
  escalation: escalationSettingSchema.optional(),
})

export const isIncidentNotificationEnabled = (
  settings: ProjectSettings | null | undefined,
  kind: AlertIncidentKind,
): boolean => settings?.notifications?.incidents?.[kind] ?? true

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
