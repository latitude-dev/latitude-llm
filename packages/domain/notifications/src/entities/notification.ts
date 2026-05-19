import {
  alertIncidentKindSchema,
  alertIncidentSourceTypeSchema,
  alertSeveritySchema,
  cuidSchema,
  type NotificationGroup,
  notificationIdSchema,
  organizationIdSchema,
  ProjectId,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"

/**
 * Per-bucket trend point snapshotted into sustained-incident payloads.
 * `threshold` is `null` for buckets with no historical data (the seasonal
 * grid had no samples for that day-of-week × hour-of-day cell); both the
 * bell sparkline and the email chart break the dashed line across these
 * gaps. Counts are integers from the issue's occurrence histogram.
 */
export const incidentTrendPointSchema = z.object({
  t: z.iso.datetime(),
  count: z.number().int().min(0),
  threshold: z.number().nullable(),
})

/**
 * Bucketed trend window snapshotted at incident-transition time. Window is
 * 3h ending at `startedAt` (`incident.opened`) or `endedAt`
 * (`incident.closed`); bucket size is currently 10 min (18 buckets), bumped
 * via `bucketDurationMs` so consumers don't hardcode it.
 */
export const incidentTrendSchema = z.object({
  bucketDurationMs: z.number().int().positive(),
  points: z.array(incidentTrendPointSchema).max(64),
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
  sourceType: alertIncidentSourceTypeSchema,
  sourceId: cuidSchema,
  incidentKind: alertIncidentKindSchema,
  severity: alertSeveritySchema,
}

/**
 * One-shot incident notifications. Today fires for `issue.new` and
 * `issue.regressed` (the alerts side stamps `endedAt = startedAt` for
 * these). No partner `incident.closed` notification ever lands.
 */
export const incidentEventPayloadSchema = z.object(incidentBasePayloadShape)
export type IncidentEventPayload = z.infer<typeof incidentEventPayloadSchema>

/**
 * Sustained incident opening. Fires when an alert incident enters an open
 * window (`endedAt IS NULL`); today only `issue.escalating`. Carries the
 * snapshotted trend window leading up to the open so the bell sparkline
 * and the email chart render from one source.
 */
export const incidentOpenedPayloadSchema = z.object({
  ...incidentBasePayloadShape,
  trend: incidentTrendSchema,
})
export type IncidentOpenedPayload = z.infer<typeof incidentOpenedPayloadSchema>

/**
 * Sustained incident close. Fires when the same incident's `endedAt`
 * transitions to non-null. Carries the trend ending at the close so the
 * recovery is visible in the chart.
 */
export const incidentClosedPayloadSchema = z.object({
  ...incidentBasePayloadShape,
  trend: incidentTrendSchema,
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
 * Single source of truth for notification kinds. Every kind declares its
 * group (drives the user-visible preferences toggle) and its payload schema
 * (used to validate jsonb at read time). Adding a new kind = adding one
 * entry here; the registry shape forces the TS exhaustiveness checks at
 * each channel's renderer registry to fail until the new kind is handled.
 */
export const NOTIFICATION_KIND_META = {
  "incident.event": { group: "incidents", payload: incidentEventPayloadSchema },
  "incident.opened": { group: "incidents", payload: incidentOpenedPayloadSchema },
  "incident.closed": { group: "incidents", payload: incidentClosedPayloadSchema },
  "wrapped.report": { group: "wrapped_reports", payload: wrappedReportPayloadSchema },
  "custom.message": { group: "custom_messages", payload: customMessagePayloadSchema },
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
