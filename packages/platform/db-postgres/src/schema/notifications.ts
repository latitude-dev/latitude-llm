import type { NotificationKind } from "@domain/notifications"
import { sql } from "drizzle-orm"
import { index, jsonb, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

/**
 * In-app notifications, one row per (user, occurrence). The `kind` column
 * is a flat enum (`incident.opened`, `wrapped.report`, …) and `payload`
 * jsonb carries the kind-specific data. Idempotency is owned by the
 * producer via `idempotency_key`: the unique `(organization_id, user_id,
 * idempotency_key)` index absorbs outbox redelivery so the same source
 * event never produces two rows. `emailed_at` is stamped by the email
 * channel worker after a successful render+send.
 *
 * RLS is org-scoped only; per-user filtering is enforced explicitly in
 * read use cases. The worker that creates notifications for all members
 * of an org needs to write rows for arbitrary userIds, which would
 * conflict with a `user_id = get_current_user_id()` RLS clause.
 */
export const notifications = latitudeSchema.table(
  "notifications",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    userId: cuid("user_id").notNull(),
    kind: varchar("kind", { length: 64 }).$type<NotificationKind>().notNull(),
    /** Producer-computed dedupe anchor; see `buildIdempotencyKey`. */
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: tzTimestamp("created_at").defaultNow().notNull(),
    seenAt: tzTimestamp("seen_at"),
    emailedAt: tzTimestamp("emailed_at"),
  },
  (t) => [
    organizationRLSPolicy("notifications"),
    // Feed query: most recent first per (user, org). Tiebreak on id keeps
    // cursor pagination stable when two rows share a created_at.
    index("notifications_user_org_recent_idx").on(t.userId, t.organizationId, t.createdAt.desc(), t.id.desc()),
    // Badge count: partial index keeps it tiny since most rows are seen.
    index("notifications_user_org_unread_idx").on(t.userId, t.organizationId).where(sql`${t.seenAt} is null`),
    // Idempotency anchor — see `idempotency_key` doc.
    uniqueIndex("notifications_idempotency_uq").on(t.organizationId, t.userId, t.idempotencyKey),
  ],
)
