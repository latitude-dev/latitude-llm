import { Context, Effect } from "effect"
import { z } from "zod"
import { INCIDENT_NOTIFICATION_KEYS, type IncidentNotificationKey } from "./alert-incident-kinds.ts"
import type { RepositoryError } from "./errors.ts"
import type { ProjectId } from "./id.ts"
import type { SqlClient } from "./sql-client.ts"

export const REDACTION_MODES = ["off", "enforce"] as const
export const redactionModeSchema = z.enum(REDACTION_MODES)
export type RedactionMode = z.infer<typeof redactionModeSchema>

export const REDACTION_ENTITIES = ["email", "phone", "credit_card", "iban", "us_ssn", "ip_address", "secret"] as const
export const redactionEntitySchema = z.enum(REDACTION_ENTITIES)
export type RedactionEntity = z.infer<typeof redactionEntitySchema>

const KNOWN_REDACTION_ENTITIES: ReadonlySet<string> = new Set(REDACTION_ENTITIES)

/** Retiring an entity leaves it behind in stored settings and in queue payloads, so both have to filter. */
export const isRedactionEntity = (value: string): value is RedactionEntity => KNOWN_REDACTION_ENTITIES.has(value)

/**
 * Entities this enum used to have. Kept rather than forgotten so a policy naming one can be told apart from
 * a policy naming an entity that never existed — see `wireRedactionEntitiesSchema`. Safe to prune once no
 * stored settings mention it, which needs a data migration rather than a code change.
 */
const RETIRED_REDACTION_ENTITIES: ReadonlySet<string> = new Set(["crypto_wallet"])

// `ip_address` is omitted: a dotted quad and a four-part version string are the same string.
export const DEFAULT_REDACTION_ENTITIES: readonly RedactionEntity[] = [
  "email",
  "phone",
  "credit_card",
  "iban",
  "us_ssn",
  "secret",
]

/**
 * Placeholder label per entity. Lives here rather than in the engine because it is part of the
 * stored data contract: it appears inside persisted content as `[REDACTED_<LABEL>]`, the web
 * chip renders it, and custom rules must not be allowed to claim one.
 */
export const REDACTION_ENTITY_LABELS: Record<RedactionEntity, string> = {
  email: "EMAIL",
  phone: "PHONE",
  credit_card: "CREDIT_CARD",
  iban: "IBAN",
  us_ssn: "US_SSN",
  ip_address: "IP_ADDRESS",
  secret: "SECRET",
}

/** Labels the engine already emits. A custom rule reusing one would make the UI's explanation of it false. */
export const RESERVED_REDACTION_LABELS: ReadonlySet<string> = new Set([
  ...Object.values(REDACTION_ENTITY_LABELS),
  "OVERSIZED_FIELD",
  "USER",
  // Retired entities keep their labels reserved: stored content still carries their placeholders.
  ...[...RETIRED_REDACTION_ENTITIES].map((entity) => entity.toUpperCase()),
])

export const REDACTION_IDENTITY_HANDLINGS = ["keep", "pseudonymize"] as const
export const redactionIdentityHandlingSchema = z.enum(REDACTION_IDENTITY_HANDLINGS)
export type RedactionIdentityHandling = z.infer<typeof redactionIdentityHandlingSchema>

export const REDACTION_RULE_KINDS = ["attribute_key", "terms", "pattern"] as const
export const redactionRuleKindSchema = z.enum(REDACTION_RULE_KINDS)
export type RedactionRuleKind = z.infer<typeof redactionRuleKindSchema>

/**
 * Caps on customer-defined rules. Every rule travels in the ingest queue job for each project
 * in a batch, so these bound Redis job size as much as they bound scan cost.
 */
export const REDACTION_MAX_RULES = 25
export const REDACTION_RULE_MAX_KEYS = 100
export const REDACTION_RULE_MAX_TERMS = 200
export const REDACTION_RULE_MAX_TERM_CHARS = 4_000
export const REDACTION_RULE_MAX_PATTERN_CHARS = 200

/** Below three characters a term shreds ordinary prose, and no identifier is that short. */
export const REDACTION_RULE_MIN_TERM_CHARS = 3

/** Matches the placeholder grammar the web chip looks for, so a custom label renders like a built-in one. */
export const REDACTION_RULE_LABEL_PATTERN = /^[A-Z][A-Z0-9_]{2,31}$/

const redactionRuleLabelSchema = z
  .string()
  .regex(REDACTION_RULE_LABEL_PATTERN)
  .refine((label) => !RESERVED_REDACTION_LABELS.has(label), { error: "label is reserved by a built-in category" })

const redactionRuleBaseShape = {
  id: z.string().min(1).max(64),
  label: redactionRuleLabelSchema,
  enabled: z.boolean().optional(),
}

const redactionTermsSchema = z
  .array(z.string().min(REDACTION_RULE_MIN_TERM_CHARS).max(256))
  .min(1)
  .max(REDACTION_RULE_MAX_TERMS)
  .refine((terms) => terms.reduce((total, term) => total + term.length, 0) <= REDACTION_RULE_MAX_TERM_CHARS, {
    error: `terms exceed ${REDACTION_RULE_MAX_TERM_CHARS} characters in total`,
  })

/**
 * Three kinds in increasing order of risk. `attribute_key` drops a named attribute and cannot
 * produce a false positive; `terms` never reaches regex syntax, so it has no backtracking
 * surface; `pattern` is the only one that needs the validator gates.
 */
export const redactionRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    ...redactionRuleBaseShape,
    kind: z.literal("attribute_key"),
    /** Exact key, or a `prefix.*` glob. Not regex: keys are short and structured, and this keeps the kind risk-free. */
    keys: z.array(z.string().min(1).max(256)).min(1).max(REDACTION_RULE_MAX_KEYS),
  }),
  z.object({
    ...redactionRuleBaseShape,
    kind: z.literal("terms"),
    terms: redactionTermsSchema,
    wholeWord: z.boolean().optional(),
    caseSensitive: z.boolean().optional(),
  }),
  z.object({
    ...redactionRuleBaseShape,
    kind: z.literal("pattern"),
    pattern: z.string().min(1).max(REDACTION_RULE_MAX_PATTERN_CHARS),
    ignoreCase: z.boolean().optional(),
    dotAll: z.boolean().optional(),
    /**
     * Which validator admitted this pattern. Validation is write-time only, so a rule accepted by
     * an older, weaker validator keeps running; recording the version is what lets a tightened
     * validator flag it later instead of trusting it silently.
     */
    validatorVersion: z.number().int().nonnegative().optional(),
  }),
])
export type RedactionRule = z.infer<typeof redactionRuleSchema>

export const isRuleEnabled = (rule: RedactionRule): boolean => rule.enabled !== false

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
  rules: z.array(redactionRuleSchema).max(REDACTION_MAX_RULES).optional(),
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

/**
 * Everything the redaction engine needs.
 *
 * Carries no mode: a policy exists only for a project that redacts, so its presence
 * is the decision. `off` projects have no policy at all, which is why the engine
 * never has to ask.
 */
export interface RedactionPolicy {
  readonly entities: ReadonlySet<RedactionEntity>
  readonly redactMetadata: boolean
  readonly identities: RedactionIdentityHandling
  /** Customer-defined rules, including disabled ones: the engine filters those when it compiles. */
  readonly rules: readonly RedactionRule[]
}

/** The settings view: `mode` is the user-facing toggle and `source` says which layer set it. */
export interface ResolvedRedactionPolicy extends RedactionPolicy {
  readonly mode: RedactionMode
  readonly source: "organization" | "project" | "default"
}

/**
 * Drops retired entities, then validates the rest strictly.
 *
 * The two cases look identical on the wire and must not be treated alike. A **retired** entity was removed
 * deliberately, so a policy naming it was written before the removal and no detector will ever claim it
 * again: dropping it is the whole of the correct behaviour, and rejecting the policy would make the worker
 * fail closed and drop the batch. An entity that is neither current nor retired means the policy came from a
 * newer deploy than this worker, where it may name a detector this code does not have — silently ignoring
 * that under-redacts, so it still fails closed.
 */
const wireRedactionEntitiesSchema = z
  .array(z.string())
  .transform((entities) => entities.filter((entity) => !RETIRED_REDACTION_ENTITIES.has(entity)))
  .pipe(z.array(redactionEntitySchema))

/** Wire form for the queue payload: `entities` becomes an array because a `Set` does not survive JSON. */
export const serializedRedactionPolicySchema = z.object({
  entities: wireRedactionEntitiesSchema,
  redactMetadata: z.boolean(),
  identities: redactionIdentityHandlingSchema,
  rules: z.array(redactionRuleSchema).max(REDACTION_MAX_RULES).optional(),
})
export type SerializedRedactionPolicy = z.infer<typeof serializedRedactionPolicySchema>

/**
 * `null` for an `off` policy, so callers omit it from the map rather than encoding a no-op.
 *
 * `rules` is omitted when empty rather than sent as `[]`, which keeps the payload for a project
 * with no custom rules byte-identical to what shipped before they existed.
 */
export const serializeRedactionPolicy = (policy: ResolvedRedactionPolicy): SerializedRedactionPolicy | null =>
  policy.mode === "off"
    ? null
    : {
        entities: [...policy.entities],
        redactMetadata: policy.redactMetadata,
        identities: policy.identities,
        ...(policy.rules.length > 0 ? { rules: [...policy.rules] } : {}),
      }

/**
 * `null` when the wire value is missing or malformed. Callers must treat that as a
 * failure rather than as "no redaction": a corrupt policy on a project that opted
 * in must never resolve to a plaintext write.
 */
export const deserializeRedactionPolicy = (wire: unknown): RedactionPolicy | null => {
  const parsed = serializedRedactionPolicySchema.safeParse(wire)

  return parsed.success
    ? { ...parsed.data, entities: new Set(parsed.data.entities), rules: parsed.data.rules ?? [] }
    : null
}

const REDACTION_SYSTEM_DEFAULTS: {
  readonly mode: RedactionMode
  readonly entities: readonly RedactionEntity[]
  readonly redactMetadata: boolean
  readonly identities: RedactionIdentityHandling
  readonly rules: readonly RedactionRule[]
} = {
  mode: "off",
  entities: DEFAULT_REDACTION_ENTITIES,
  redactMetadata: false,
  identities: "keep",
  rules: [],
}

/** `locked` gates who may change the policy rather than forming part of it, so it does not make one exist. */
const REDACTION_NON_POLICY_KEYS: ReadonlySet<string> = new Set(["locked"])

const hasPresentValue = (value: unknown): boolean => {
  if (value === undefined) return false
  if (value === null || typeof value !== "object" || Array.isArray(value)) return true

  return Object.values(value).some(hasPresentValue)
}

/**
 * Whether a layer sets any redaction field — what makes a project an override rather than an
 * inheritor, which is what `source` reports and what the settings UI counts.
 *
 * Structural rather than a list of field names. The named-field version silently excluded every
 * field added after it was written, so a layer that set only a new field reported as unset.
 */
export const hasRedactionField = (setting: OrganizationRedactionSetting | undefined): boolean =>
  setting !== undefined &&
  Object.entries(setting).some(([key, value]) => !REDACTION_NON_POLICY_KEYS.has(key) && hasPresentValue(value))

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
      rules: org.rules ?? REDACTION_SYSTEM_DEFAULTS.rules,
      source: "organization",
    }
  }

  return {
    mode: project?.mode ?? org?.mode ?? REDACTION_SYSTEM_DEFAULTS.mode,
    entities: new Set(project?.entities ?? org?.entities ?? REDACTION_SYSTEM_DEFAULTS.entities),
    redactMetadata: project?.scopes?.metadata ?? org?.scopes?.metadata ?? REDACTION_SYSTEM_DEFAULTS.redactMetadata,
    identities: project?.identities ?? org?.identities ?? REDACTION_SYSTEM_DEFAULTS.identities,
    // Replace, not union, exactly like `entities`. An unlocked organization policy is a default
    // that a project may weaken; `locked` is what makes it a floor. Unioning rules alone would
    // mean a project could drop an organization entity but not an organization rule.
    rules: project?.rules ?? org?.rules ?? REDACTION_SYSTEM_DEFAULTS.rules,
    source: hasRedactionField(project) ? "project" : hasRedactionField(org) ? "organization" : "default",
  }
}

/**
 * Whether two policies differ, for deciding whether a write is a no-op.
 *
 * Structural for the same reason `hasRedactionField` is, and this one is load-bearing: the
 * named-field version it replaced compared four fields, so a change touching only a field
 * added later compared equal, and the write returned early with nothing saved and no audit
 * event emitted while the caller reported success.
 */
export const isSameRedactionSetting = (
  a: OrganizationRedactionSetting | null | undefined,
  b: OrganizationRedactionSetting | null | undefined,
): boolean => JSON.stringify(canonicalizeRedaction(a)) === JSON.stringify(canonicalizeRedaction(b))

/** Entity order is a UI artifact. Rule order is not: it breaks overlap ties, so a reorder is a change. */
const UNORDERED_REDACTION_KEYS: ReadonlySet<string> = new Set(["entities"])

const canonicalizeRedaction = (value: unknown, key?: string): unknown => {
  if (value === undefined || value === null) return null

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalizeRedaction(item))

    return key !== undefined && UNORDERED_REDACTION_KEYS.has(key) ? [...items].sort() : items
  }

  if (typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([entryKey, entry]) => [entryKey, canonicalizeRedaction(entry, entryKey)]),
  )
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
