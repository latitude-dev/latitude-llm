import { boolean, pgEnum, pgSchema, text, timestamp, varchar } from "drizzle-orm/pg-core";

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

const latitudeSchema = pgSchema("latitude");

// User role enum
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

/**
 * User table - stores user accounts
 *
 * This is the core Better Auth user table.
 */
export const user = latitudeSchema.table("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("user"),
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Session table - stores active sessions
 */
export const session = latitudeSchema.table("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Organization plugin adds activeOrganizationId via additionalFields
});

/**
 * Account table - stores OAuth provider accounts
 */
export const account = latitudeSchema.table("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Verification table - stores email verification tokens and magic links
 */
export const verification = latitudeSchema.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Organization member role enum
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);

/**
 * Organization table - stores organizations/workspaces
 *
 * Better Auth organization plugin table with extended fields for billing
 * and workspace management. This is the primary tenant boundary.
 */
export const organization = latitudeSchema.table("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  logo: text("logo"),
  metadata: text("metadata"), // JSON stored as text
  // Extended fields from former workspaces table
  creatorId: text("creator_id").references(() => user.id),
  currentSubscriptionId: text("current_subscription_id"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Member table - stores organization memberships
 *
 * Better Auth organization plugin table.
 */
export const member = latitudeSchema.table("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: memberRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Invitation table - stores pending organization invitations
 *
 * Better Auth organization plugin table.
 */
export const invitation = latitudeSchema.table("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: memberRoleEnum("role"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
