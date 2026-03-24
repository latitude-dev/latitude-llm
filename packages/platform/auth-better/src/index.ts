import { stripe } from "@better-auth/stripe"
import { MembershipRepository } from "@domain/organizations"
import { generateId, UserId } from "@domain/shared"
import { MembershipRepositoryLive, type PostgresClient, postgresSchema, SqlClientLive } from "@platform/db-postgres"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { customSession, magicLink, organization } from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import type { BetterAuthPlugin } from "better-auth/types"
import { Effect } from "effect"
import Stripe from "stripe"

/**
 * Better Auth configuration and factory.
 *
 * This module creates a Better Auth instance configured with:
 * - Drizzle ORM adapter for PostgreSQL
 * - OAuth providers (Google, GitHub)
 * - Organization plugin for multi-tenancy (workspaces)
 * - Stripe plugin for subscription management
 * - Session management
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
  // Magic Link email configuration
  readonly sendMagicLink?: (params: { email: string; url: string; token: string }) => Promise<void>
  // User creation hook for onboarding
  readonly onUserCreated?: (user: { id: string; email: string; name?: string }) => Promise<void>
  // Trusted origins for callback URLs
  readonly trustedOrigins?: string[]
  // Mount path where Better Auth handlers are exposed
  readonly basePath?: string
  // TanStack Start cookie integration for server functions
  readonly enableTanStackCookies?: boolean
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

  // Get OAuth credentials from env if not provided
  const googleClientId = config.googleClientId ?? Effect.runSync(parseEnvOptional("LAT_GOOGLE_CLIENT_ID", "string"))
  const googleClientSecret =
    config.googleClientSecret ?? Effect.runSync(parseEnvOptional("LAT_GOOGLE_CLIENT_SECRET", "string"))
  const githubClientId = config.githubClientId ?? Effect.runSync(parseEnvOptional("LAT_GITHUB_CLIENT_ID", "string"))
  const githubClientSecret =
    config.githubClientSecret ?? Effect.runSync(parseEnvOptional("LAT_GITHUB_CLIENT_SECRET", "string"))

  // Get Stripe credentials from env if not provided
  const stripeSecretKey = config.stripeSecretKey ?? Effect.runSync(parseEnvOptional("LAT_STRIPE_SECRET_KEY", "string"))
  const stripeWebhookSecret =
    config.stripeWebhookSecret ?? Effect.runSync(parseEnvOptional("LAT_STRIPE_WEBHOOK_SECRET", "string"))

  // Create organization plugin
  // Note: Better Auth's organization plugin has a type issue where 'team' schema
  // is typed as potentially undefined, but BetterAuthPlugin expects it to be required.
  // This is a known issue in Better Auth's type definitions (v1.2.7+).
  // See: https://github.com/better-auth/better-auth/issues/3079
  const orgPlugin: BetterAuthPlugin = organization({
    allowUserToCreateOrganization: () => true,
  }) as BetterAuthPlugin

  // Build plugins array
  const plugins: BetterAuthPlugin[] = [orgPlugin]

  plugins.push(
    customSession(async ({ user, session }) => {
      const activeOrganizationIdInSession = "activeOrganizationId" in session ? session.activeOrganizationId : null
      if (activeOrganizationIdInSession) return { user, session }

      const memberships = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* MembershipRepository
          return yield* repo.findByUserId(UserId(user.id))
        }).pipe(Effect.provide(MembershipRepositoryLive), Effect.provide(SqlClientLive(config.client))),
      )
      const activeOrganizationId = memberships[0]?.organizationId

      return {
        user,
        session: {
          ...session,
          ...(activeOrganizationId ? { activeOrganizationId } : {}),
        },
      }
    }) as BetterAuthPlugin,
  )

  // Add Magic Link plugin if email sender is configured
  if (config.sendMagicLink) {
    const sendMagicLinkFn = config.sendMagicLink
    const magicLinkPlugin = magicLink({
      sendMagicLink: async ({ email, url, token }) => {
        await sendMagicLinkFn({ email, url, token })
      },
      expiresIn: 3600, // 1 hour
    }) as BetterAuthPlugin
    plugins.push(magicLinkPlugin)
  }

  // Add Stripe plugin if credentials are available
  if (stripeSecretKey && stripeWebhookSecret) {
    const stripeClient = new Stripe(stripeSecretKey, {
      apiVersion: "2026-02-25.clover",
    })

    const stripePlugin = stripe({
      stripeClient,
      stripeWebhookSecret,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: config.subscriptionPlans ?? [],
        authorizeReference: async ({
          user,
          referenceId,
        }: {
          user: { id: string }
          referenceId: string
          action: string
        }) => {
          // Default authorization: users can manage their own subscriptions
          // For organization subscriptions, check if user is owner/admin
          if (referenceId !== user.id) {
            // This would need to check if user is an owner/admin of the organization
            // For now, allow all - the caller should implement proper authorization
            return true
          }
          return true
        },
      },
      organization: {
        enabled: true,
      },
    }) as BetterAuthPlugin

    plugins.push(stripePlugin)
  }

  if (config.enableTanStackCookies) {
    plugins.push(tanstackStartCookies() as BetterAuthPlugin)
  }

  return betterAuth({
    database: drizzleAdapter(config.client.db, {
      provider: "pg",
      schema: {
        user: postgresSchema.user,
        session: postgresSchema.session,
        account: postgresSchema.account,
        verification: postgresSchema.verification,
        organization: postgresSchema.organization,
        member: postgresSchema.member,
        invitation: postgresSchema.invitation,
      },
    }),
    baseURL: baseUrl,
    basePath,
    secret,
    // Trusted origins for callback URL validation
    trustedOrigins: config.trustedOrigins ?? [],
    // OAuth providers
    socialProviders: {
      ...(googleClientId &&
        googleClientSecret && {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }),
      ...(githubClientId &&
        githubClientSecret && {
          github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
          },
        }),
    },
    // TODO: review
    // Email/password enabled for CLI authentication
    // Note: Email verification disabled for MVP - will be enabled in Phase 2
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // Password reset will be implemented in Phase 3
      sendResetPasswordEmail: false,
    },
    // Magic links (passwordless)
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
    },
    // Session configuration
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: "compact",
      },
    },
    // Use CUID2 for ID generation
    advanced: {
      database: {
        generateId: () => generateId(),
      },
    },
    // Multi-tenancy via organizations plugin + Stripe for billing
    plugins,
    // Database hooks for user onboarding
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            if (config.onUserCreated) {
              await config.onUserCreated({
                id: user.id,
                email: user.email,
                name: user.name ?? undefined,
              })
            }
          },
        },
      },
    },
  })
}

// Export types from better-auth for convenience
export type { Session, User } from "better-auth"
