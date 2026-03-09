import { boolean, jsonb, text } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Outbox events table for reliable event publishing.
 *
 * Scoped to the 'latitude' schema.
 */

export const outboxEvents = latitudeSchema.table("outbox_events", {
  id: cuid("id").primaryKey(),
  eventName: text("event_name").notNull(),
  aggregateId: cuid("aggregate_id").notNull(),
  organizationId: cuid("workspace_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  published: boolean("published").notNull().default(false),
  publishedAt: tzTimestamp("published_at"),
  occurredAt: tzTimestamp("occurred_at").notNull(),
  createdAt: tzTimestamp("created_at").notNull().defaultNow(),
})
