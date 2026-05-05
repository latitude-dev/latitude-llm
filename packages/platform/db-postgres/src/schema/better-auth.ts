import type { OrganizationSettings } from "@domain/shared"
import { boolean, index, integer, jsonb, text, varchar } from "drizzle-orm/pg-core"
import {
  cuid,
  latitudeSchema,
  organizationRLSPolicy,
  subscriptionReferenceRLSPolicy,
  timestamps,
  tzTimestamp,
} from "../schemaHelpers.ts"

/**
 * Better Auth tables (`better-auth/adapters/drizzle`, `usePlural: true`).
 *
 * Column sets and index names follow `better-auth.schema.reference.ts`
 * (`pnpm run auth:generate-schema-reference`), extended with:
 * - `latitude` PostgreSQL schema
 * - CUID2 ids (`varchar(24)`), `timestamptz` via {@link tzTimestamp}
 * - App-only columns (e.g. `users.role`, `organizations.settings`)
 * - RLS on `members`, `invitations`, `subscriptions`
 *
 * Physical table names are plural (`users`, `sessions`, …) to match the generated reference.
 */

export type UserRole = "user" | "admin"
export type MemberRole = "owner" | "admin" | "member"

export const users = latitudeSchema.table("users", {
  id: cuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** App extension (not in BA reference). */
  role: varchar("role", { length: 50 }).notNull().default("user").$type<UserRole>(),
  /**
   * Required by the Better Auth `admin` plugin. Its unconditional
   * `session.create.before` hook reads `user.banned` on every session
   * creation, and the Drizzle adapter builds `SELECT`s from the plugin's
   * declared schema — so the columns must physically exist in the DB.
   *
   * We install the plugin for its impersonation endpoints, not its ban
   * feature. No ban UI is exposed today; leaving the columns in place
   * means banning can be turned on later with zero schema work.
   */
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: tzTimestamp("ban_expires"),
  stripeCustomerId: text("stripe_customer_id"),
  ...timestamps(),
})

export const sessions = latitudeSchema.table(
  "sessions",
  {
    id: cuid("id").primaryKey(),
    expiresAt: tzTimestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: cuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
    /**
     * Set by the Better Auth `admin` plugin when an admin impersonates
     * another user. Holds the admin's user id for the lifetime of the
     * impersonation session, so `stopImpersonating` can restore the
     * original session without requiring a re-login. Nullable in every
     * other case.
     */
    impersonatedBy: text("impersonated_by"),
    ...timestamps(),
  },
  (t) => [
    index("sessions_userId_idx").on(t.userId),
    index("sessions_activeOrganizationId_idx").on(t.activeOrganizationId),
  ],
)

export const accounts = latitudeSchema.table(
  "accounts",
  {
    id: cuid("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: cuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tzTimestamp("access_token_expires_at"),
    refreshTokenExpiresAt: tzTimestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps(),
  },
  (t) => [index("accounts_userId_idx").on(t.userId)],
)

export const verifications = latitudeSchema.table(
  "verifications",
  {
    id: cuid("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tzTimestamp("expires_at").notNull(),
    ...timestamps(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
)

export const organizations = latitudeSchema.table("organizations", {
  id: cuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  stripeCustomerId: text("stripe_customer_id"),
  /** App extension (not in BA reference). */
  settings: jsonb("settings").$type<OrganizationSettings>(),
  ...timestamps(),
})

export const members = latitudeSchema.table(
  "members",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: cuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("member").$type<MemberRole>(),
    createdAt: tzTimestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    organizationRLSPolicy("members"),
    index("members_organizationId_idx").on(t.organizationId),
    index("members_userId_idx").on(t.userId),
  ],
)

export const invitations = latitudeSchema.table(
  "invitations",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: tzTimestamp("expires_at").notNull(),
    createdAt: tzTimestamp("created_at").notNull().defaultNow(),
    inviterId: cuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    organizationRLSPolicy("invitations"),
    index("invitations_organizationId_idx").on(t.organizationId),
    index("invitations_email_idx").on(t.email),
    index("invitations_inviterId_idx").on(t.inviterId),
  ],
)

/**
 * Better Auth Stripe plugin — `reference_id` is org or user id.
 * Matches `better-auth.schema.reference.ts` (`pnpm run auth:generate-schema-reference`).
 */
export const subscriptions = latitudeSchema.table(
  "subscriptions",
  {
    id: cuid("id").primaryKey(),
    plan: text("plan").notNull(),
    referenceId: text("reference_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status").default("incomplete"),
    periodStart: tzTimestamp("period_start"),
    periodEnd: tzTimestamp("period_end"),
    trialStart: tzTimestamp("trial_start"),
    trialEnd: tzTimestamp("trial_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    cancelAt: tzTimestamp("cancel_at"),
    canceledAt: tzTimestamp("canceled_at"),
    endedAt: tzTimestamp("ended_at"),
    seats: integer("seats"),
    billingInterval: text("billing_interval"),
    stripeScheduleId: text("stripe_schedule_id"),
  },
  (t) => [
    subscriptionReferenceRLSPolicy(),
    index("subscriptions_reference_status_period_end_idx").on(t.referenceId, t.status, t.periodEnd),
  ],
)
