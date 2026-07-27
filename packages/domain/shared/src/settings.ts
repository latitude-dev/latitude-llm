import { Context, Effect } from "effect"
import { z } from "zod"
import { INCIDENT_NOTIFICATION_KEYS, type IncidentNotificationKey } from "./alert-incident-kinds.ts"
import type { RepositoryError } from "./errors.ts"
import type { ProjectId } from "./id.ts"
import type { SqlClient } from "./sql-client.ts"

export const REDACTION_MODES = ["off", "dryRun", "enforce"] as const
export const redactionModeSchema = z.enum(REDACTION_MODES)
export type RedactionMode = z.infer<typeof redactionModeSchema>

export const REDACTION_ENTITIES = [
  "email",
  "phone",
  "credit_card",
  "iban",
  "us_ssn",
  "ip_address",
  "secret",
  "crypto_wallet",
] as const
export const redactionEntitySchema = z.enum(REDACTION_ENTITIES)
export type RedactionEntity = z.infer<typeof redactionEntitySchema>

// `ip_address` and `crypto_wallet` are omitted: they collide with version strings and hex hashes.
export const DEFAULT_REDACTION_ENTITIES: readonly RedactionEntity[] = [
  "email",
  "phone",
  "credit_card",
  "iban",
  "us_ssn",
  "secret",
]

export const REDACTION_IDENTITY_HANDLINGS = ["keep", "pseudonymize"] as const
export const redactionIdentityHandlingSchema = z.enum(REDACTION_IDENTITY_HANDLINGS)
export type RedactionIdentityHandling = z.infer<typeof redactionIdentityHandlingSchema>

/** `metadata` covers both the `metadata` map and `tags`. */
export const redactionScopesSettingSchema = z.object({
  metadata: z.boolean().optional(),
})
export type RedactionScopesSetting = z.infer<typeof redactionScopesSettingSchema>

export const redactionSettingSchema = z.object({
  mode: redactionModeSchema.optional(),
  entities: z.array(redactionEntitySchema).optional(),
  scopes: redactionScopesSettingSchema.optional(),
  identities: redactionIdentityHandlingSchema.optional(),
})
export type RedactionSetting = z.infer<typeof redactionSettingSchema>

/** `locked` makes the org policy authoritative: project redaction settings are ignored, not merged. */
export const organizationRedactionSettingSchema = redactionSettingSchema.extend({
  locked: z.boolean().optional(),
})
export type OrganizationRedactionSetting = z.infer<typeof organizationRedactionSettingSchema>

export const organizationSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(), // default for resolve's "keep evaluating" choice; cascaded project → org → system
  billing: z
    .object({
      spendingLimitCents: z.number().int().positive().optional(),
    })
    .optional(),
  wantsShowcase: z.boolean().optional(),
  redaction: organizationRedactionSettingSchema.optional(),
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
  /**
   * Marks a project as belonging to the shared read-only Showcase (built by the
   * regeneration workflow in the showcase org). Distinct from `isSample` (the
   * per-signup demo) so exclusion filters — taxonomy gardening, retention
   * handling, landing-project preference — can skip showcase projects without
   * conflating them with per-org samples.
   */
  isShowcase: z.boolean().optional(),
  sampling: samplingSettingSchema.optional(),
  redaction: redactionSettingSchema.optional(),
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

/** `source` is display only: which layer the policy the user is looking at came from. */
export interface ResolvedRedactionPolicy {
  readonly mode: RedactionMode
  readonly entities: ReadonlySet<RedactionEntity>
  readonly redactMetadata: boolean
  readonly identities: RedactionIdentityHandling
  readonly source: "organization" | "project" | "default"
}

const REDACTION_SYSTEM_DEFAULTS: {
  readonly mode: RedactionMode
  readonly entities: readonly RedactionEntity[]
  readonly redactMetadata: boolean
  readonly identities: RedactionIdentityHandling
} = {
  mode: "off",
  entities: DEFAULT_REDACTION_ENTITIES,
  redactMetadata: false,
  identities: "keep",
}

const hasRedactionField = (setting: RedactionSetting | undefined): boolean =>
  setting !== undefined &&
  (setting.mode !== undefined ||
    setting.entities !== undefined ||
    setting.scopes?.metadata !== undefined ||
    setting.identities !== undefined)

export function resolveRedactionPolicy(input: {
  organization: OrganizationSettings | null | undefined
  project: ProjectSettings | null | undefined
}): ResolvedRedactionPolicy {
  const org = input.organization?.redaction
  const project = input.project?.redaction

  if (org?.locked) {
    return {
      mode: org.mode ?? REDACTION_SYSTEM_DEFAULTS.mode,
      entities: new Set(org.entities ?? REDACTION_SYSTEM_DEFAULTS.entities),
      redactMetadata: org.scopes?.metadata ?? REDACTION_SYSTEM_DEFAULTS.redactMetadata,
      identities: org.identities ?? REDACTION_SYSTEM_DEFAULTS.identities,
      source: "organization",
    }
  }

  return {
    mode: project?.mode ?? org?.mode ?? REDACTION_SYSTEM_DEFAULTS.mode,
    entities: new Set(project?.entities ?? org?.entities ?? REDACTION_SYSTEM_DEFAULTS.entities),
    redactMetadata: project?.scopes?.metadata ?? org?.scopes?.metadata ?? REDACTION_SYSTEM_DEFAULTS.redactMetadata,
    identities: project?.identities ?? org?.identities ?? REDACTION_SYSTEM_DEFAULTS.identities,
    source: hasRedactionField(project) ? "project" : hasRedactionField(org) ? "organization" : "default",
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

    return resolveSettingsCascade({
      organization: orgSettings,
      project: projectSettings,
    })
  })
