import { Context, Effect } from "effect"
import { z } from "zod"
import { INCIDENT_NOTIFICATION_KEYS, type IncidentNotificationKey } from "./alert-incident-kinds.ts"
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

const incidentNotificationsKindShape = Object.fromEntries(
  INCIDENT_NOTIFICATION_KEYS.map((kind) => [kind, z.boolean().optional()] as const),
) as { [K in IncidentNotificationKey]: z.ZodOptional<z.ZodBoolean> }

export const incidentNotificationsSettingSchema = z.object(incidentNotificationsKindShape)
export type IncidentNotificationsSetting = z.infer<typeof incidentNotificationsSettingSchema>

/**
 * Project-level gate for the `destinations` notification group. A single
 * boolean today (`quarantine`) — the only destinations kind that fans out to
 * org members. Missing → `true` (on by default; opt out per project).
 */
export const destinationNotificationsSettingSchema = z.object({
  quarantine: z.boolean().optional(),
})
export type DestinationNotificationsSetting = z.infer<typeof destinationNotificationsSettingSchema>

export const notificationsSettingSchema = z.object({
  incidents: incidentNotificationsSettingSchema.optional(),
  destinations: destinationNotificationsSettingSchema.optional(),
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
 *
 * TODO: Remove after releasing monitors for everybody — the knob moves onto the
 * system "Signal escalating" monitor's alert; this stays as the flag-off fallback.
 */
export const escalationSettingSchema = z.object({
  sensitivity: z.number().int().min(1).max(6).optional(),
})
export type EscalationSetting = z.infer<typeof escalationSettingSchema>

/** Trace sampling: keep a deterministic fraction of ingested batches, keyed by `session_id || trace_id`. */
export const samplingSettingSchema = z.object({
  enabled: z.boolean().optional(),
  rate: z.number().min(0).max(1).optional(),
})
export type SamplingSetting = z.infer<typeof samplingSettingSchema>

export const projectSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(),
  notifications: notificationsSettingSchema.optional(),
  escalation: escalationSettingSchema.optional(),
  onboardingType: z.enum(["prod-traces", "code-agents"]).optional(),
  onboardingCompleted: z.boolean().optional(),
  isSample: z.boolean().optional(),
  sampling: samplingSettingSchema.optional(),
})

export const isIncidentNotificationEnabled = (
  settings: ProjectSettings | null | undefined,
  kind: IncidentNotificationKey,
): boolean => settings?.notifications?.incidents?.[kind] ?? true

/** Project-level gate for `destination.quarantined` notifications. On by default. */
export const isDestinationNotificationEnabled = (settings: ProjectSettings | null | undefined): boolean =>
  settings?.notifications?.destinations?.quarantine ?? true

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
