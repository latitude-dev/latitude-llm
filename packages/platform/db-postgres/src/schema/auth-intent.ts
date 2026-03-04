import { sql } from "drizzle-orm"
import { boolean, jsonb, text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export type AuthIntentType = "login" | "signup" | "invite"

export const authIntent = latitudeSchema.table("auth_intent", {
  id: cuid("id").primaryKey(),
  type: varchar("type", { length: 32 }).notNull().$type<AuthIntentType>(),
  email: text("email").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  existingAccountAtRequest: boolean("existing_account_at_request").notNull().default(false),
  createdOrganizationId: text("created_organization_id"),
  expiresAt: tzTimestamp("expires_at").notNull(),
  consumedAt: tzTimestamp("consumed_at"),
  ...timestamps(),
})
