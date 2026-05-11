import {
  ALERT_INCIDENT_KINDS,
  cuidSchema,
  notificationIdSchema,
  organizationIdSchema,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"

/**
 * High-level system identifier for the notification. Each type owns its own
 * `payload` shape and (optionally) a `source_id` pointing at an entity.
 *
 * Adding a new system that needs to surface notifications = add a new value
 * here + a renderer entry on the web side. The schema doesn't change.
 */
export const NOTIFICATION_TYPES = ["incident", "custom_message"] as const
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES)
export type NotificationType = z.infer<typeof notificationTypeSchema>

/**
 * Discriminator for incident notifications: opening vs closing the incident.
 * The same `alert_incident` row produces one `opened` and (for sustained
 * kinds) one `closed` notification, distinguished only by this field.
 */
export const INCIDENT_NOTIFICATION_EVENTS = ["opened", "closed"] as const
export const incidentNotificationEventSchema = z.enum(INCIDENT_NOTIFICATION_EVENTS)
export type IncidentNotificationEvent = z.infer<typeof incidentNotificationEventSchema>

/**
 * Snapshot of issue + project identity captured at notification-creation
 * time. The renderer uses these for instant first paint (no live lookup
 * needed) and for navigation. They're optional because:
 *   - existing rows from before this field landed don't have them, and
 *   - if the underlying issue/project lookup fails at creation we'd rather
 *     write the notification with no snapshot than block delivery.
 *
 * The renderer should still issue a live `getIssue` query to refresh the
 * name + status — `issueName` here is a frozen-at-creation fallback that
 * survives issue deletion. IDs use cuids (matching the rest of the app's
 * deep-link patterns) so the renderer can both navigate and re-fetch
 * without a new uuid-keyed lookup.
 */
export const incidentNotificationPayloadSchema = z.object({
  event: incidentNotificationEventSchema,
  incidentKind: z.enum(ALERT_INCIDENT_KINDS),
  issueId: z.string().optional(),
  issueName: z.string().optional(),
  projectId: z.string().optional(),
  projectSlug: z.string().optional(),
})
export type IncidentNotificationPayload = z.infer<typeof incidentNotificationPayloadSchema>

export const customMessageNotificationPayloadSchema = z.object({
  title: z.string(),
  content: z.string().optional(),
  link: z.string().optional(),
})
export type CustomMessageNotificationPayload = z.infer<typeof customMessageNotificationPayloadSchema>

/**
 * Storage shape — `payload` is loosely typed at this layer since the row is
 * polymorphic on `type`. Per-type narrowing happens at the renderer / use
 * case via the discriminated payload schemas above.
 */
export const notificationSchema = z.object({
  id: notificationIdSchema,
  organizationId: organizationIdSchema,
  userId: userIdSchema,
  type: notificationTypeSchema,
  sourceId: cuidSchema.nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  seenAt: z.date().nullable(),
})
export type Notification = z.infer<typeof notificationSchema>
