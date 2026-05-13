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
 * - App-only columns (e.g. `users.role`, `organizations.settings`,
 *   `oauth_applications.organization_id`)
 * - RLS on `members`, `invitations`, `subscriptions`, `oauth_applications`
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
  /**
   * Free-text job title collected during the project-onboarding form. Optional
   * because v1 users imported into v2 may not have one, and the field is not
   * required for sign-in or core product use. Synced to Loops as `jobTitle`
   * when set.
   */
  jobTitle: text("job_title"),
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
 * Better Auth `mcp` plugin — registered OAuth client (e.g. an MCP-capable
 * agent installation). The plugin populates these on `/api/auth/mcp/register`,
 * `/api/auth/mcp/authorize`, and `/api/auth/oauth2/consent`.
 *
 * App extensions on the BA reference:
 * - `organization_id` (NEW column, not in BA reference). Bound at consent
 *   time by the web `/auth/consent` page after the user picks which org
 *   this MCP client should act on behalf of. Nullable because the row is
 *   created earlier (at `/api/auth/mcp/register`) before any org context
 *   exists; rows that stay NULL after the consent flow are abandoned
 *   registrations. See `plans/mcp-oauth-api-expansion.md` (D5).
 *
 * RLS is enabled and scoped by `organization_id`: the settings/keys page
 * on web reads through the regular tenant-scoped connection and only sees
 * MCP clients bound to the active org. Rows with `organization_id IS NULL`
 * are invisible to tenant queries by design (abandoned registrations
 * shouldn't show up in any org's MCP keys list).
 *
 * Token validation on the API uses the admin Postgres connection (same
 * pattern as `api_keys.findByTokenHash`) — it must, because the lookup
 * happens before any organization context is established (the org id is
 * what we're trying to discover from the access token). The admin role
 * bypasses RLS so the auth middleware can read the application row to
 * resolve the bound org.
 */
export const oauthApplications = latitudeSchema.table(
  "oauth_applications",
  {
    id: cuid("id").primaryKey(),
    name: text("name"),
    icon: text("icon"),
    metadata: text("metadata"),
    clientId: text("client_id").unique(),
    clientSecret: text("client_secret"),
    redirectUrls: text("redirect_urls"),
    type: text("type"),
    disabled: boolean("disabled").default(false),
    userId: cuid("user_id", { default: false }).references(() => users.id, { onDelete: "cascade" }),
    organizationId: cuid("organization_id", { default: false }).references(() => organizations.id, {
      onDelete: "cascade",
    }),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("oauth_applications"),
    index("oauthApplications_userId_idx").on(t.userId),
    index("oauthApplications_organizationId_idx").on(t.organizationId),
  ],
)

/**
 * Better Auth `mcp` plugin — issued OAuth access + refresh tokens. The MCP
 * client exchanges the auth code at `/api/auth/mcp/token` for a row in here;
 * subsequent API calls present `accessToken` as `Authorization: Bearer …` and
 * the API's auth middleware joins to {@link oauthApplications}.metadata to
 * resolve the bound organization.
 */
export const oauthAccessTokens = latitudeSchema.table(
  "oauth_access_tokens",
  {
    id: cuid("id").primaryKey(),
    accessToken: text("access_token").unique(),
    refreshToken: text("refresh_token").unique(),
    accessTokenExpiresAt: tzTimestamp("access_token_expires_at"),
    refreshTokenExpiresAt: tzTimestamp("refresh_token_expires_at"),
    clientId: text("client_id").references(() => oauthApplications.clientId, { onDelete: "cascade" }),
    userId: cuid("user_id", { default: false }).references(() => users.id, { onDelete: "cascade" }),
    scopes: text("scopes"),
    ...timestamps(),
  },
  (t) => [index("oauthAccessTokens_clientId_idx").on(t.clientId), index("oauthAccessTokens_userId_idx").on(t.userId)],
)

/**
 * Better Auth `mcp` plugin — per-user, per-client consent record. Tracks
 * whether a user has approved a given OAuth client to act on their behalf,
 * and which scopes the consent covers.
 */
export const oauthConsents = latitudeSchema.table(
  "oauth_consents",
  {
    id: cuid("id").primaryKey(),
    clientId: text("client_id").references(() => oauthApplications.clientId, { onDelete: "cascade" }),
    userId: cuid("user_id", { default: false }).references(() => users.id, { onDelete: "cascade" }),
    scopes: text("scopes"),
    consentGiven: boolean("consent_given"),
    ...timestamps(),
  },
  (t) => [index("oauthConsents_clientId_idx").on(t.clientId), index("oauthConsents_userId_idx").on(t.userId)],
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
