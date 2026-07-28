import type { DBAdapter } from "@better-auth/core/db/adapter"
import { sso } from "@better-auth/sso"
import { type StripeOptions, type StripePlugin, stripe } from "@better-auth/stripe"
import { generateId } from "@domain/shared"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { type BetterAuthOptions, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { admin as adminPlugin, captcha, magicLink, organization as organizationPlugin } from "better-auth/plugins"
import { Effect } from "effect"
import Stripe from "stripe"
import type { PostgresClient } from "./client.ts"

import {
  accounts,
  invitations,
  members,
  oauthAccessTokens,
  oauthApplications,
  oauthConsents,
  organizations,
  sessions,
  ssoProviders,
  subscriptions,
  users,
  verifications,
} from "./schema/better-auth.ts"

/**
 * Better Auth configuration and factory.
 *
 * Wired with the Drizzle adapter against {@link PostgresClient#db}, organization + Stripe plugins,
 * and app-specific session / onboarding hooks.
 */

export interface BetterAuthConfig {
  readonly client: PostgresClient
  readonly baseUrl?: string
  readonly secret?: string
  readonly googleClientId?: string
  readonly googleClientSecret?: string
  readonly githubClientId?: string
  readonly githubClientSecret?: string
  readonly stripeSecretKey?: string
  readonly stripeWebhookSecret?: string
  readonly stripePublishableKey?: string
  readonly subscriptionPlans?: StripePlanConfig[]
  readonly sendMagicLink: (params: { email: string; url: string; token: string }) => Promise<void>
  readonly sendInvitationEmail: (
    params: {
      id: string
      email: string
      role: string
      organization: { name: string }
      inviter: { user: { id: string; name?: string | null; email: string } }
    },
    request?: Request,
  ) => Promise<void>
  readonly onUserCreated?: (user: { id: string; email: string; name?: string }) => Promise<void>
  readonly onBeforeUserCreate?: (user: { email: string }, request: Request | undefined) => Promise<void>
  readonly onMemberCreated?: (member: { organizationId: string; userId: string; role: string }) => Promise<void>
  readonly onSubscriptionChanged?: (subscription: {
    referenceId: string
    subscriptionId: string
    eventType:
      | "subscription-complete"
      | "subscription-created"
      | "subscription-updated"
      | "subscription-canceled"
      | "subscription-deleted"
  }) => Promise<void>
  readonly trustedOrigins?: string[]
  readonly basePath?: string
  readonly captchaSecretKey?: string
  readonly extraPlugins?: BetterAuthOptions["plugins"]
  /**
   * When set, only emails from this domain (e.g. "latitude.so") are allowed to sign up or sign in.
   * Used on staging to restrict access to internal users only.
   */
  readonly allowedEmailDomain?: string
  /**
   * SSO enforcement predicate: true when the email's domain has a verified
   * SSO provider with `enforced = true`. Consulted on session creation for
   * the magic-link and social sign-in paths (SSO callbacks are exempt) —
   * see the `session.create.before` hook below.
   */
  readonly isSsoEnforcedForEmail?: (email: string) => Promise<boolean>
}

export interface StripePlanConfig {
  readonly name: string
  readonly priceId: string
  readonly annualDiscountPriceId?: string
  readonly limits?: Record<string, number>
  readonly freeTrial?: {
    readonly days: number
  }
}

export const createBetterAuth = (config: BetterAuthConfig) => {
  const baseUrl = config.baseUrl ?? Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
  const basePath = config.basePath ?? "/auth"
  const secret = config.secret ?? Effect.runSync(parseEnv("LAT_BETTER_AUTH_SECRET", "string"))

  const googleClientId = config.googleClientId ?? Effect.runSync(parseEnvOptional("LAT_GOOGLE_CLIENT_ID", "string"))
  const googleClientSecret =
    config.googleClientSecret ?? Effect.runSync(parseEnvOptional("LAT_GOOGLE_CLIENT_SECRET", "string"))
  const githubClientId = config.githubClientId ?? Effect.runSync(parseEnvOptional("LAT_GITHUB_CLIENT_ID", "string"))
  const githubClientSecret =
    config.githubClientSecret ?? Effect.runSync(parseEnvOptional("LAT_GITHUB_CLIENT_SECRET", "string"))

  const stripeSecretKey = config.stripeSecretKey ?? Effect.runSync(parseEnvOptional("LAT_STRIPE_SECRET_KEY", "string"))
  const stripeWebhookSecret =
    config.stripeWebhookSecret ?? Effect.runSync(parseEnvOptional("LAT_STRIPE_WEBHOOK_SECRET", "string"))
  const stripeClient =
    stripeSecretKey && stripeWebhookSecret
      ? new Stripe(stripeSecretKey, {
          apiVersion: "2026-05-27.dahlia",
        })
      : null

  const database = drizzleAdapter(config.client.db, {
    provider: "pg",
    usePlural: true,
    schema: {
      users,
      sessions,
      accounts,
      verifications,
      organizations,
      members,
      invitations,
      subscriptions,
      // OIDC Provider plugin tables — required when the caller installs the
      // `mcp` (or `oidcProvider`) plugin via `extraPlugins`. Including them
      // in the shared adapter is harmless when the plugin is not installed:
      // the tables exist in the DB regardless, and BA only writes to them
      // when the plugin runs.
      oauthApplications,
      oauthAccessTokens,
      oauthConsents,
      ssoProviders,
    },
  }) as unknown as DBAdapter

  return betterAuth({
    database,
    baseURL: baseUrl,
    basePath,
    secret,
    trustedOrigins: config.trustedOrigins ?? [],
    /**
     * Enterprise SSO posture: provider registration and mutation are
     * server-side only (web SSO settings server fns calling
     * `auth.api.registerSSOProvider` & co. after feature-flag + owner/admin
     * checks). `disabledPaths` only blocks the HTTP router (404) — direct
     * `auth.api.*` calls are unaffected. Sign-in, ACS/callback, and SP
     * metadata endpoints stay routable.
     */
    disabledPaths: [
      "/sso/register",
      "/sso/update-provider",
      "/sso/delete-provider",
      "/sso/request-domain-verification",
      "/sso/verify-domain",
    ],
    // The `users.role` column is surfaced on the session user by the
    // `admin` plugin installed below. The plugin declares it in its own
    // schema (`{ type: "string", required: false, input: false }`), so
    // we do NOT need a separate `user.additionalFields.role` entry —
    // declaring both produces duplicate-field warnings. `input: false`
    // still holds: the role is read-only through sign-up / update APIs.
    user: {
      additionalFields: {
        // Free-text job title captured during the project-onboarding form.
        // `input: false` keeps it out of Better Auth's signup / update API
        // surface — we write it via our own onboarding server function.
        jobTitle: { type: "string", required: false, input: false },
        phoneNumber: { type: "string", required: false, input: false },
        heardAboutUs: { type: "string", required: false, input: false },
        heardAboutUsOther: { type: "string", required: false, input: false },
      },
    },
    /**
     * `create.after` hooks run **after** the surrounding transaction commits
     * (Better Auth ≥ 1.6.0). If the outbox write below fails, the user/member
     * row is already persisted and no event is emitted — we accept that
     * trade-off because the alternative (running side effects inside the auth
     * transaction) holds DB locks and risks deadlocks on retries.
     */
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            if (config.allowedEmailDomain && !user.email.toLowerCase().endsWith(`@${config.allowedEmailDomain}`)) {
              throw new Error(`Only @${config.allowedEmailDomain} emails are allowed on staging`)
            }
            await config.onBeforeUserCreate?.({ email: user.email }, ctx?.request)
            return { data: user }
          },
          after: async (user) => {
            await config.onUserCreated?.({ id: user.id, email: user.email, name: user.name })
          },
        },
      },
      member: {
        create: {
          after: async (member: { organizationId: string; userId: string; role: string }) => {
            await config.onMemberCreated?.({
              organizationId: member.organizationId,
              userId: member.userId,
              role: member.role,
            })
          },
        },
      },
      session: {
        create: {
          /**
           * SSO enforcement. Whitelist of enforced sign-in paths:
           * - `/callback/:id` — social OAuth callback (Google/GitHub)
           * - `/magic-link/verify` — covers links issued before enforcement
           *   was switched on (issuance is already blocked in the web
           *   `sendMagicLink` server fn)
           * Everything else (SSO callbacks, admin impersonation, token
           * flows) creates sessions untouched.
           */
          before: async (session, ctx) => {
            if (!config.isSsoEnforcedForEmail || !ctx) return { data: session }

            const path = ctx.path ?? ""
            // BA 1.6.x routes: social OAuth callbacks land on `/callback/:id`;
            // SSO callbacks land on `/sso/callback/:id` (OIDC) and
            // `/sso/saml2/sp/acs/:id` (SAML) — neither starts with "/callback",
            // so they are correctly exempt from enforcement here.
            const isEnforcedPath = path === "/magic-link/verify" || path.startsWith("/callback")
            if (!isEnforcedPath) return { data: session }

            const user = await ctx.context.internalAdapter.findUserById(session.userId)
            if (user && (await config.isSsoEnforcedForEmail(user.email))) {
              throw new APIError("FORBIDDEN", { message: "Your organization requires SSO sign-in" })
            }
            return { data: session }
          },
        },
      },
    },
    /**
     * OAuth security posture:
     * - Better Auth 1.6.9 stores `accounts.accountId` from the provider user info `id`
     *   (`sub` for OIDC providers such as Google), not from mutable email.
     * - Do not implicitly link OAuth identities to existing users by matching email during sign-in;
     *   users must link additional OAuth providers from an authenticated session.
     * - Persist OAuth state in `verifications` and keep the signed state cookie check enabled.
     */
    account: {
      storeStateStrategy: "database",
      skipStateCookieCheck: false,
      accountLinking: {
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        updateUserInfoOnLink: false,
        allowUnlinkingAll: true,
      },
    },
    socialProviders: {
      ...(googleClientId &&
        googleClientSecret && {
          google: async () => ({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          }),
        }),
      ...(githubClientId &&
        githubClientSecret && {
          github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
          },
        }),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      /**
       * Disable BA's session "freshness" gate (default: 24h since
       * `session.createdAt`). With 7-day sessions, the default made
       * `/unlink-account` fail with "Session is not fresh" for any session
       * older than a day — most signed-in users. The check guards nothing
       * else we use (our delete flow is a custom server fn, not BA's
       * `delete-user`), and we have no re-auth UX to satisfy it: sign-in is
       * magic-link/OAuth, so "enter your password to continue" isn't a thing.
       */
      freshAge: 0,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: "compact",
      },
    },
    advanced: {
      database: {
        generateId: () => generateId(),
      },
    },
    plugins: [
      organizationPlugin({
        sendInvitationEmail: async (data, request) => {
          await config.sendInvitationEmail(
            {
              id: data.id,
              email: data.email,
              role: data.role,
              organization: { name: data.organization.name },
              inviter: {
                user: {
                  id: data.inviter.user.id,
                  name: data.inviter.user.name,
                  email: data.inviter.user.email,
                },
              },
            },
            request,
          )
        },
      }),
      magicLink({
        sendMagicLink: async ({ email, url, token }) => {
          await config.sendMagicLink({ email, url, token })
        },
        expiresIn: 3600,
        allowedAttempts: 5,
      }),
      /**
       * Backoffice impersonation.
       *
       * The plugin ships `impersonateUser` / `stopImpersonating` endpoints
       * that store the admin's id in `sessions.impersonatedBy`, so the
       * admin can return to their original session without logging out
       * and back in.
       *
       * `adminRoles` matches the app-extended `users.role` column (see
       * `better-auth.ts`). The plugin also requires the `users.banned /
       * banReason / banExpires` columns — they exist for this reason, not
       * because we expose any ban UI today.
       */
      adminPlugin({
        defaultRole: "user",
        adminRoles: ["admin"],
        impersonationSessionDuration: 60 * 60,
      }),
      /**
       * Enterprise SSO (SAML 2.0 + OIDC). Providers are org-bound rows in
       * `sso_providers` (see schema comment there for the RLS / admin-client
       * read rules and the app-extended `enforced` column).
       *
       * - JIT-provisions users and org members (`defaultRole: "member"`)
       *   into the provider's bound organization on first SSO sign-in.
       * - `domainVerification` requires a DNS TXT proof before domain-matched
       *   sign-ins activate for a provider.
       * - IdP-initiated SAML is rejected (`allowIdpInitiated: false`):
       *   unsolicited assertions are an audience-injection risk; every
       *   sign-in must correlate to an SP-initiated AuthnRequest.
       * - `requireTimestamps` enforces SAML2Int (Okta, Entra, OneLogin all
       *   comply).
       */
      sso({
        organizationProvisioning: {
          disabled: false,
          defaultRole: "member",
        },
        domainVerification: { enabled: true },
        saml: {
          enableInResponseToValidation: true,
          allowIdpInitiated: false,
          requireTimestamps: true,
        },
      }),
      ...(config.captchaSecretKey
        ? [
            captcha({
              provider: "cloudflare-turnstile",
              secretKey: config.captchaSecretKey,
              endpoints: ["/sign-in/magic-link", "/sign-in/social"],
            }),
          ]
        : []),
      ...(stripeClient && stripeWebhookSecret
        ? [
            stripe({
              stripeClient,
              stripeWebhookSecret,
              createCustomerOnSignUp: true,
              subscription: {
                enabled: true,
                plans: config.subscriptionPlans ?? [],
                onSubscriptionComplete: async ({ subscription }) => {
                  await config.onSubscriptionChanged?.({
                    referenceId: subscription.referenceId,
                    subscriptionId: subscription.id,
                    eventType: "subscription-complete",
                  })
                },
                onSubscriptionCreated: async ({ subscription }) => {
                  await config.onSubscriptionChanged?.({
                    referenceId: subscription.referenceId,
                    subscriptionId: subscription.id,
                    eventType: "subscription-created",
                  })
                },
                onSubscriptionUpdate: async ({ subscription }) => {
                  await config.onSubscriptionChanged?.({
                    referenceId: subscription.referenceId,
                    subscriptionId: subscription.id,
                    eventType: "subscription-updated",
                  })
                },
                onSubscriptionCancel: async ({ subscription }) => {
                  await config.onSubscriptionChanged?.({
                    referenceId: subscription.referenceId,
                    subscriptionId: subscription.id,
                    eventType: "subscription-canceled",
                  })
                },
                onSubscriptionDeleted: async ({ subscription }) => {
                  await config.onSubscriptionChanged?.({
                    referenceId: subscription.referenceId,
                    subscriptionId: subscription.id,
                    eventType: "subscription-deleted",
                  })
                },
                authorizeReference: async ({
                  user: stripeUser,
                  referenceId,
                }: {
                  user: { id: string }
                  referenceId: string
                  action: string
                }) => {
                  const { and, eq: eq_ } = await import("drizzle-orm")
                  const memberRole = await config.client.db
                    .select({ role: members.role })
                    .from(members)
                    .where(and(eq_(members.organizationId, referenceId), eq_(members.userId, stripeUser.id)))
                    .limit(1)
                    .then((rows) => rows[0]?.role)

                  if (!memberRole) return false
                  return memberRole === "owner" || memberRole === "admin"
                },
              },
              organization: {
                enabled: true,
              },
              // NOTE: we need this casting to avoid infinite recursion in TS
            }) as StripePlugin<StripeOptions>,
          ]
        : []),
      // Caller-provided plugins are spread LAST so a cookie-integration plugin
      // (e.g. `tanstackStartCookies`) lands at the very end of the array.
      // Better Auth forwards `Set-Cookie` headers from plugins whose
      // `hooks.after` run before the cookie plugin, so it must come last.
      ...(config.extraPlugins ?? []),
    ],
  })
}

export type { Session, User } from "better-auth"
