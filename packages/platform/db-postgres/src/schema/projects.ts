import { sql } from "drizzle-orm";
import { pgPolicy, pgSchema, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Projects table - stores projects within organizations.
 *
 * Supports soft delete via deleted_at.
 * RLS is enabled on this table.
 * Uses text ID for consistency with Better Auth tables.
 *
 * Scoped to the 'latitude' schema.
 */

const latitudeSchema = pgSchema("latitude");

export const projects = latitudeSchema.table(
  "projects",
  {
    id: text("id").primaryKey(), // UUID, consistent with Better Auth
    organizationId: text("organization_id").notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 256 }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("projects_organization_policy", {
      for: "all",
      to: "public",
      using: sql`organization_id = get_current_organization_id()`,
      withCheck: sql`organization_id = get_current_organization_id()`,
    }),
  ],
);
