import type { DBAdapter } from "@better-auth/core/db/adapter"
import { type StripeOptions, type StripePlugin, stripe } from "@better-auth/stripe"
import { generateId } from "@domain/shared"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { type BetterAuthOptions, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin as adminPlugin, captcha, magicLink, organization as organizationPlugin } from "better-auth/plugins"
import { Effect } from "effect"
import Stripe from "stripe"
import type { PostgresClient } from "./client.ts"

import {
  accounts,
  invitations,
  members,
  organizations,
  sessions,
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
  readonly onMemberCreated?: (member: { organizationId: string; userId: string; role: string }) => Promise<void>
  readonly trustedOrigins?: string[]
  readonly basePath?: string
  readonly captchaSecretKey?: string
  readonly extraPlugins?: BetterAuthOptions["plugins"]
  /**
   * When set, only emails from this domain (e.g. "latitude.so") are allowed to sign up or sign in.
   * Used on staging to restrict access to internal users only.
   */
  readonly allowedEmailDomain?: string
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
  const baseUrl = config.baseUrl ?? Effect.runSync(parseEnv("LAT_BETTER_AUTH_URL", "string", "http://localhost:3000"))
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
          apiVersion: "2026-04-22.dahlia",
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
    },
  }) as unknown as DBAdapter

  return betterAuth({
    database,
    baseURL: baseUrl,
    basePath,
    secret,
    trustedOrigins: config.trustedOrigins ?? [],
    // The `users.role` column is surfaced on the session user by the
    // `admin` plugin installed below. The plugin declares it in its own
    // schema (`{ type: "string", required: false, input: false }`), so
    // we do NOT need a separate `user.additionalFields.role` entry —
    // declaring both produces duplicate-field warnings. `input: false`
    // still holds: the role is read-only through sign-up / update APIs.
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (config.allowedEmailDomain && !user.email.toLowerCase().endsWith(`@${config.allowedEmailDomain}`)) {
              throw new Error(`Only @${config.allowedEmailDomain} emails are allowed on staging`)
            }
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
    },
    socialProviders: {
      ...(googleClientId &&
        googleClientSecret && {
          google: async () => ({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            /** Keep `users.image` in sync with Google profile photos on each sign-in. */
            overrideUserInfoOnSignIn: true,
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
      ...(config.captchaSecretKey
        ? [
            captcha({
              provider: "cloudflare-turnstile",
              secretKey: config.captchaSecretKey,
              endpoints: ["/sign-in/magic-link", "/sign-in/social"],
            }),
          ]
        : []),
      ...(config.extraPlugins ?? []),
      ...(stripeClient && stripeWebhookSecret
        ? [
            stripe({
              stripeClient,
              stripeWebhookSecret,
              createCustomerOnSignUp: true,
              subscription: {
                enabled: true,
                plans: config.subscriptionPlans ?? [],
                authorizeReference: async ({
                  user: stripeUser,
                  referenceId,
                }: {
                  user: { id: string }
                  referenceId: string
                  action: string
                }) => {
                  const { eq: eq_ } = await import("drizzle-orm")
                  const memberRole = await config.client.db
                    .select({ role: members.role })
                    .from(members)
                    .where(eq_(members.organizationId, referenceId) && eq_(members.userId, stripeUser.id))
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
    ],
  })
}

export type { Session, User } from "better-auth"
