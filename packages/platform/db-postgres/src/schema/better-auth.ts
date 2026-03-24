import type { OrganizationSettings } from "@domain/shared";
import { boolean, jsonb, text, varchar } from "drizzle-orm/pg-core";
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts";

/**
 * Better Auth Schema - Drizzle ORM definitions
 *
 * These tables are used by Better Auth for authentication and organization management.
 * Better Auth expects specific table and column names.
 *
 * Core tables:
 * - user: User accounts
 * - session: Active sessions
 * - account: OAuth provider accounts
 * - verification: Email verification tokens
 *
 * Organization plugin tables (workspaces):
 * - organization: Organizations/workspaces with billing metadata
 * - member: Organization memberships
 * - invitation: Pending invitations
 *
 * All tables are scoped to the 'latitude' schema.
 */

export type UserRole = "user" | "admin"
export type MemberRole = "owner" | "admin" | "member"

/**
 * User table - stores user accounts
 *
 * This is the core Better Auth user table.
 */
export const user = latitudeSchema.table("user", {
  id: cuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  image: text("image"),
  role: varchar("role", { length: 50 }).notNull().default("user").$type<UserRole>(),
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: tzTimestamp("ban_expires"),
  ...timestamps(),
})

/**
 * Session table - stores active sessions
 */
export const session = latitudeSchema.table("session", {
  id: cuid("id").primaryKey(),
  expiresAt: tzTimestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: cuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps(),
})

/**
 * Account table - stores OAuth provider accounts
 */
export const account = latitudeSchema.table("account", {
  id: cuid("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: cuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: tzTimestamp("access_token_expires_at"),
  refreshTokenExpiresAt: tzTimestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  ...timestamps(),
})

/**
 * Verification table - stores email verification tokens and magic links
 */
export const verification = latitudeSchema.table("verification", {
  id: cuid("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: tzTimestamp("expires_at").notNull(),
  ...timestamps(),
})

/**
 * Organization table - stores organizations/workspaces
 *
 * Better Auth organization plugin table with extended fields for billing
 * and workspace management. This is the primary tenant boundary.
 */
export const organization = latitudeSchema.table("organization", {
  id: cuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  logo: text("logo"),
  metadata: text("metadata"),
  creatorId: cuid("creator_id").references(() => user.id),
  currentSubscriptionId: cuid("current_subscription_id"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 256 }),
  settings: jsonb("settings").$type<OrganizationSettings>(),
  ...timestamps(),
})

/**
 * Member table - stores organization memberships
 *
 * Better Auth organization plugin table.
 */
export const member = latitudeSchema.table(
  "member",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: cuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("member").$type<MemberRole>(),
    createdAt: tzTimestamp("created_at").notNull().defaultNow(),
  },
  () => [organizationRLSPolicy("member")],
)

/**
 * Invitation table - stores pending organization invitations
 *
 * Better Auth organization plugin table.
 */
export const invitation = latitudeSchema.table(
  "invitation",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: varchar("role", { length: 50 }).$type<MemberRole>(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    expiresAt: tzTimestamp("expires_at").notNull(),
    inviterId: cuid("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  () => [organizationRLSPolicy("invitation")],
)
