import {
  alertIncidentConditionSchema,
  alertSeveritySchema,
  cuidSchema,
  incidentNotificationKeySchema,
  incidentSourceTypeSchema,
  type NotificationGroup,
  notificationIdSchema,
  organizationIdSchema,
  ProjectId,
  userIdSchema,
} from "@domain/shared"
import { signalPrioritySchema } from "@domain/signals"
import { z } from "zod"

/**
 * Per-bucket trend point snapshotted into sustained-incident payloads.
 * `threshold` is `null` for buckets with no historical data (the seasonal
 * grid had no samples for that day-of-week × hour-of-day cell); both the
 * bell sparkline and the email chart break the dashed line across these
 * gaps. Counts are integers from the signal's occurrence histogram.
 */
export const incidentTrendPointSchema = z.object({
  t: z.iso.datetime(),
  count: z.number().int().min(0),
  threshold: z.number().nullable(),
})

/**
 * The triggering incident, snapshotted onto the trend so the chart can draw a severity band
 * (the incident's active span) and a start dot — mirroring the in-app issue-detail drawer. The
 * window/anchor live on the trend itself; this just carries the incident's own timestamps and
 * severity. Optional so payloads written before this field still parse.
 */
const incidentTrendMarkerSchema = z.object({
  startedAt: z.iso.datetime(),
  /** `null` while the incident is still open (e.g. `incident.opened`). */
  endedAt: z.iso.datetime().nullable(),
  severity: alertSeveritySchema,
})
export type IncidentTrendMarker = z.infer<typeof incidentTrendMarkerSchema>

/**
 * Bucketed trend window snapshotted at incident-transition time, frozen so the immutable PNG
 * matches what the signal-detail drawer showed at that moment. Window is 14 days of UTC-aligned
 * 12h buckets (~28 points) anchored at `startedAt` (`incident.opened`) or `endedAt`
 * (`incident.closed`) — the same range + granularity the drawer renders. `bucketDurationMs` is
 * carried so consumers don't hardcode it (older payloads still carry their 10-min value).
 */
export const incidentTrendSchema = z.object({
  bucketDurationMs: z.number().int().positive(),
  points: z.array(incidentTrendPointSchema).max(64),
  marker: incidentTrendMarkerSchema.optional(),
})
export type IncidentTrend = z.infer<typeof incidentTrendSchema>

/**
 * Base shape shared by every incident notification kind. Fields are
 * generic on the incident source (`sourceType` + `sourceId` mirror
 * `alert_incidents`) so the same payload shape extends naturally if a
 * future alert kind has a non-issue source. Project and issue display
 * data are resolved live downstream from `notification.projectId` +
 * `payload.sourceId` — no snapshot duplication here.
 */
const incidentBasePayloadShape = {
  alertIncidentId: cuidSchema,
  sourceType: incidentSourceTypeSchema,
  sourceId: cuidSchema,
  incidentKind: incidentNotificationKeySchema,
  severity: alertSeveritySchema,
  // Monitor attribution, resolved by the producer for monitor-sourced incidents.
  // `name`/`slug` ride on the payload so templates render the linked "Created by monitor X" line with no round-trip.
  monitorId: cuidSchema.optional(),
  monitorName: z.string().optional(),
  monitorSlug: z.string().optional(),
  /** Firing alert's condition snapshot, for the humanised summary. */
  condition: alertIncidentConditionSchema.nullable().optional(),
  /**
   * Signal triage snapshot at producer time. Present only for signal-sourced
   * incidents produced after these fields landed; absent for monitor
   * sources and legacy stored rows (hence optional). `null` means
   * "snapshotted, but unassigned / no priority". The assignee's display
   * name is NOT snapshotted — renderers resolve it live from the id.
   */
  assigneeId: cuidSchema.nullable().optional(),
  priority: signalPrioritySchema.nullable().optional(),
}

/**
 * Top-N tag chips snapshotted from the signal's recent traces. Sorted
 * alphabetically and capped so the email body stays compact. The
 * producer slices to 5 entries; the schema enforces the cap.
 */
export const incidentTagsSchema = z.array(z.string()).max(5)

/**
 * Attribution for an incident sample excerpt. Three flavors:
 *
 * - `user`: a human-authored annotation. Renders as an avatar (image
 *   or initials fallback) + name.
 * - `system`: a Latitude-authored annotation (`annotatorId IS NULL`
 *   and `sourceId === "SYSTEM"`). Renders with the Latitude logo and
 *   an "Agent" badge to match the in-app annotation card.
 * - `evaluation`: an automatic-evaluation score. Renders the
 *   evaluation's name (e.g. "warranty-judge").
 *
 * `imageUrl` is best-effort. Most mail clients block remote images by
 * default — templates render the initials fallback when the image
 * doesn't load.
 */
const incidentSampleAuthorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("user"),
    name: z.string().min(1),
    imageUrl: z.string().nullable(),
  }),
  z.object({ kind: z.literal("system") }),
  z.object({
    kind: z.literal("evaluation"),
    name: z.string().min(1),
  }),
])
export type IncidentSampleAuthor = z.infer<typeof incidentSampleAuthorSchema>

/**
 * One-line excerpt from a recent annotation (`rawFeedback`) or
 * automatic evaluation result. Lets the recipient triage from inbox
 * without clicking through. `truncated` is true when the source text
 * exceeded 200 chars and was cropped.
 */
export const incidentSampleExcerptSchema = z.object({
  text: z.string().max(200),
  truncated: z.boolean(),
  author: incidentSampleAuthorSchema,
})
export type IncidentSampleExcerpt = z.infer<typeof incidentSampleExcerptSchema>

/**
 * Breach scalars snapshotted at incident open. Drives the email's
 * "rate climbed to X/hr — Nx the baseline of Y/hr" summary line.
 * Rates are in occurrences/hour.
 */
export const incidentBreachSchema = z.object({
  triggerRate: z.number(),
  baselineRate: z.number(),
  threshold: z.number(),
})
export type IncidentBreach = z.infer<typeof incidentBreachSchema>

/**
 * Recovery scalars snapshotted at incident close. Drives the email's
 * "elevated for {humanizedDuration}" summary line. `peakRate` left out
 * of V1 — copy reads fine without it.
 */
export const incidentRecoverySchema = z.object({
  durationMs: z.number().int().min(0),
})
export type IncidentRecovery = z.infer<typeof incidentRecoverySchema>

/**
 * One-shot incident notifications. Point-in-time incidents stamp
 * `endedAt = startedAt`; no partner `incident.closed` notification lands.
 */
export const incidentEventPayloadSchema = z.object({
  ...incidentBasePayloadShape,
  tags: incidentTagsSchema.optional(),
  sampleExcerpt: incidentSampleExcerptSchema.optional(),
})
export type IncidentEventPayload = z.infer<typeof incidentEventPayloadSchema>

/**
 * Sustained incident opening. Fires when an alert incident enters an open
 * window (`endedAt IS NULL`). Carries the
 * snapshotted trend window leading up to the open so the bell sparkline
 * and the email chart render from one source.
 */
export const incidentOpenedPayloadSchema = z.object({
  ...incidentBasePayloadShape,
  // Signal trend snapshot — absent for monitor-sourced incidents.
  trend: incidentTrendSchema.optional(),
  tags: incidentTagsSchema.optional(),
  /**
   * Optional: legacy escalating incidents opened before
   * `alert_incidents.entrySignals` started being captured have no
   * breach scalars to snapshot. The email template falls back to a
   * generic line in that case.
   */
  breach: incidentBreachSchema.optional(),
  /**
   * Optional: latest annotation rawFeedback or evaluation feedback —
   * same shape as on `incident.event`. The escalating email shows it
   * as a "what triggered this" preview so the recipient sees the
   * actual content without clicking through.
   */
  sampleExcerpt: incidentSampleExcerptSchema.optional(),
})
export type IncidentOpenedPayload = z.infer<typeof incidentOpenedPayloadSchema>

/**
 * Sustained incident close. Fires when the same incident's `endedAt`
 * transitions to non-null. Carries the trend ending at the close so the
 * recovery is visible in the chart, plus the duration so the copy can
 * say "elevated for X minutes".
 */
export const incidentClosedPayloadSchema = z.object({
  ...incidentBasePayloadShape,
  // Signal trend snapshot — absent for monitor-sourced incidents.
  trend: incidentTrendSchema.optional(),
  recovery: incidentRecoverySchema,
})
export type IncidentClosedPayload = z.infer<typeof incidentClosedPayloadSchema>

export const wrappedReportPayloadSchema = z.object({
  wrappedReportId: z.string(),
  /** Absolute URL to `/wrapped/<id>`. */
  link: z.string(),
})
export type WrappedReportPayload = z.infer<typeof wrappedReportPayloadSchema>

export const customMessagePayloadSchema = z.object({
  title: z.string(),
  content: z.string().optional(),
  link: z.string().optional(),
})
export type CustomMessagePayload = z.infer<typeof customMessagePayloadSchema>

/**
 * Direct-assignment notification ("X assigned you to <issue>"). Single
 * recipient — the new assignee. Display names are NOT snapshotted —
 * renderers resolve actor + issue display data live from the ids.
 * `assignedAt` rides on the payload because `buildIdempotencyKey` derives
 * the per-assignment-event dedupe anchor from it: stable across outbox
 * redelivery (the frozen payload replays the same key), unique across
 * assignment events (each change writes a new timestamp), so A→B→A
 * re-notifies A without ever duplicating a single assignment.
 */
export const signalAssignedPayloadSchema = z.object({
  signalId: cuidSchema,
  actorUserId: cuidSchema,
  assignedAt: z.iso.datetime(),
})
export type SignalAssignedPayload = z.infer<typeof signalAssignedPayloadSchema>

export const signalDiscoveredPayloadSchema = z.object({
  signalId: cuidSchema,
  discoveredAt: z.iso.datetime(),
})
export type SignalDiscoveredPayload = z.infer<typeof signalDiscoveredPayloadSchema>

export const signalRegressedPayloadSchema = z.object({
  signalId: cuidSchema,
  regressedAt: z.iso.datetime(),
  /** Occurrence that reopened the resolved signal; discriminates regression cycles. */
  triggerScoreId: cuidSchema,
})
export type SignalRegressedPayload = z.infer<typeof signalRegressedPayloadSchema>

/**
 * A data destination flipped to `quarantined` (5 consecutive terminal sync
 * failures) and stopped exporting. Fans out to org members so someone
 * reconnects it. Unlike issue/project display data, a destination has no live
 * downstream resolver in the bell, so the name + kind are snapshotted here;
 * `quarantinedAt` is the per-occurrence idempotency anchor (a later
 * re-quarantine after recovery re-notifies). `failureMessage` is the sanitized
 * `last_failure_message` (status + taxonomy, never an upstream response body).
 */
export const destinationQuarantinedPayloadSchema = z.object({
  destinationId: cuidSchema,
  destinationName: z.string().min(1),
  destinationKind: z.string().min(1),
  quarantinedAt: z.iso.datetime(),
  failureMessage: z.string().nullable(),
})
export type DestinationQuarantinedPayload = z.infer<typeof destinationQuarantinedPayloadSchema>

/**
 * Organization crossed a billing threshold for the current period — free
 * included credits exhausted, Pro entered overage, or a configured Pro spend
 * cap reached. Fans out to owners and admins only (members who cannot change
 * billing settings are excluded). Org-scoped (`projectId` null); organization
 * + period + limit kind form the once-per-period idempotency anchor (org is
 * required because period bounds alone are not unique across tenants, and
 * the create-notification queue dedupe key is built from this string).
 */
export const billingLimitReachedPayloadSchema = z.object({
  organizationId: cuidSchema,
  limitKind: z.enum(["included-credits", "overage-started", "spend-cap"]),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  includedCredits: z.number().int().nonnegative(),
  consumedCredits: z.number().int().nonnegative(),
  overageCredits: z.number().int().nonnegative(),
})
export type BillingLimitReachedPayload = z.infer<typeof billingLimitReachedPayloadSchema>

/**
 * Single source of truth for notification kinds. Every kind declares its
 * group (drives the user-visible preferences toggle) and its payload schema
 * (used to validate jsonb at read time). Adding a new kind = adding one
 * entry here; the registry shape forces the TS exhaustiveness checks at
 * each channel's renderer registry to fail until the new kind is handled.
 */
export const NOTIFICATION_KIND_META = {
  "incident.event": { group: "incidents", payload: incidentEventPayloadSchema },
  "incident.opened": {
    group: "incidents",
    payload: incidentOpenedPayloadSchema,
  },
  "incident.closed": {
    group: "incidents",
    payload: incidentClosedPayloadSchema,
  },
  "wrapped.report": {
    group: "wrapped_reports",
    payload: wrappedReportPayloadSchema,
  },
  "custom.message": {
    group: "custom_messages",
    payload: customMessagePayloadSchema,
  },
  "issue.assigned": { group: "personal", payload: signalAssignedPayloadSchema },
  "signal.discovered": { group: "incidents", payload: signalDiscoveredPayloadSchema },
  "signal.regressed": { group: "incidents", payload: signalRegressedPayloadSchema },
  "destination.quarantined": {
    group: "destinations",
    payload: destinationQuarantinedPayloadSchema,
  },
  "billing.limit-reached": {
    group: "billing",
    payload: billingLimitReachedPayloadSchema,
  },
} as const satisfies Record<string, { readonly group: NotificationGroup; readonly payload: z.ZodTypeAny }>

export type NotificationKind = keyof typeof NOTIFICATION_KIND_META
export const NOTIFICATION_KINDS = Object.keys(NOTIFICATION_KIND_META) as readonly NotificationKind[]
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS as [NotificationKind, ...NotificationKind[]])

export const groupOf = (kind: NotificationKind): NotificationGroup => NOTIFICATION_KIND_META[kind].group

export const payloadSchemaFor = <K extends NotificationKind>(kind: K): (typeof NOTIFICATION_KIND_META)[K]["payload"] =>
  NOTIFICATION_KIND_META[kind].payload

/**
 * Storage shape. `payload` stays loosely typed at this layer since the row
 * is polymorphic on `kind`. Per-kind narrowing happens at the read site
 * (renderers, email worker) using `payloadSchemaFor(kind).parse(payload)`.
 */
export const notificationSchema = z.object({
  id: notificationIdSchema,
  organizationId: organizationIdSchema,
  userId: userIdSchema,
  kind: notificationKindSchema,
  /**
   * Producer-computed dedupe anchor. Format is `${kind}:${entityId}` for
   * kinds that have a natural source (incidents, wrapped reports), or
   * `${kind}:${generatedId}` for kinds without one (custom messages). The
   * `(organization_id, user_id, idempotency_key)` unique index absorbs
   * outbox redelivery so the same source event never produces two rows.
   */
  idempotencyKey: z.string(),
  /**
   * Optional project anchor. Populated for kinds tied to a project
   * (`incident.*`, `wrapped.report`); `null` for cross-project kinds
   * (`custom.message`). When the project is deleted, rows with this set
   * are removed via the `delete-by-project` cascade task.
   */
  projectId: cuidSchema.transform(ProjectId).nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  seenAt: z.date().nullable(),
  emailedAt: z.date().nullable(),
})
export type Notification = z.infer<typeof notificationSchema>
