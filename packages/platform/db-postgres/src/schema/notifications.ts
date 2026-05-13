import type { NotificationType } from "@domain/notifications"
import { sql } from "drizzle-orm"
import { index, jsonb, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

/**
 * In-app notifications, one row per (user, event). Polymorphic source pattern:
 * `type` is the system identifier (today: `incident`, `custom_message`),
 * `source_id` points at the source entity for types that have one (nullable
 * for types that don't, e.g. `custom_message`), and `payload` carries
 * type-specific data (e.g. `{ event: "opened" | "closed", incidentKind }` for
 * incident notifications).
 *
 * RLS is org-scoped only; per-user filtering is enforced explicitly in read
 * use cases. The worker that creates notifications for all members of an org
 * needs to write rows for arbitrary userIds, which would conflict with a
 * `user_id = get_current_user_id()` RLS clause.
 */
export const notifications = latitudeSchema.table(
  "notifications",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    userId: cuid("user_id").notNull(),
    type: varchar("type", { length: 32 }).$type<NotificationType>().notNull(),
    sourceId: varchar("source_id", { length: 24 }),
    payload: jsonb("payload").notNull(),
    createdAt: tzTimestamp("created_at").defaultNow().notNull(),
    seenAt: tzTimestamp("seen_at"),
  },
  (t) => [
    organizationRLSPolicy("notifications"),
    // Feed query: most recent first per (user, org). Tiebreak on id keeps
    // cursor pagination stable when two rows share a created_at.
    index("notifications_user_org_recent_idx").on(t.userId, t.organizationId, t.createdAt.desc(), t.id.desc()),
    // Badge count: partial index keeps it tiny since most rows are seen.
    index("notifications_user_org_unread_idx").on(t.userId, t.organizationId).where(sql`${t.seenAt} is null`),
    // Idempotency for incident notifications under outbox redelivery: one
    // notification per (org, user, incident, event). `payload->>'event'` is
    // the discriminator between opened/closed for the same alert_incident.
    uniqueIndex("notifications_incident_event_uq")
      .on(t.organizationId, t.userId, t.sourceId, sql`(${t.payload}->>'event')`)
      .where(sql`${t.type} = 'incident' and ${t.sourceId} is not null`),
  ],
)
