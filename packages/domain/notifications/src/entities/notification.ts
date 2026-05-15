import {
  ALERT_INCIDENT_KINDS,
  type NotificationGroup,
  notificationIdSchema,
  organizationIdSchema,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"

/**
 * Per-kind payload schemas. Each kind is a flat enum value with its own
 * payload shape (no nested event discriminator). The schema for a kind is
 * looked up at the boundary (queue consumer, renderer) to narrow the
 * loosely-typed `payload` jsonb.
 */
export const incidentOpenedPayloadSchema = z.object({
  incidentKind: z.enum(ALERT_INCIDENT_KINDS),
  alertIncidentId: z.string(),
  issueId: z.string().optional(),
  issueName: z.string().optional(),
  projectId: z.string().optional(),
  projectSlug: z.string().optional(),
})
export type IncidentOpenedPayload = z.infer<typeof incidentOpenedPayloadSchema>

// Same shape as `incident.opened` today, but kept as a distinct schema so
// `incident.closed` can diverge (e.g., add a `closedAt` snapshot) without
// touching every call site.
export const incidentClosedPayloadSchema = z.object({
  incidentKind: z.enum(ALERT_INCIDENT_KINDS),
  alertIncidentId: z.string(),
  issueId: z.string().optional(),
  issueName: z.string().optional(),
  projectId: z.string().optional(),
  projectSlug: z.string().optional(),
})
export type IncidentClosedPayload = z.infer<typeof incidentClosedPayloadSchema>

export const wrappedReportPayloadSchema = z.object({
  wrappedReportId: z.string(),
  projectName: z.string(),
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
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  seenAt: z.date().nullable(),
  emailedAt: z.date().nullable(),
})
export type Notification = z.infer<typeof notificationSchema>
