import { boolean, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core"
import { cuid } from "../schemaHelpers.js"

/**
 * Outbox events table for reliable event publishing.
 *
 * Scoped to the 'latitude' schema.
 */

const latitudeSchema = pgSchema("latitude")

export const outboxEvents = latitudeSchema.table("outbox_events", {
  id: cuid("id").primaryKey(),
  eventName: text("event_name").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  published: boolean("published").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
