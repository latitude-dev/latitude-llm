import type { PostgresDb } from "@platform/db-postgres";
import { postgresSchema } from "@platform/db-postgres";
import { parseEnv, parseEnvOptional } from "@platform/env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import type { BetterAuthPlugin } from "better-auth/types";
import { Effect } from "effect";

/**
 * Better Auth configuration and factory.
 *
 * This module creates a Better Auth instance configured with:
 * - Drizzle ORM adapter for PostgreSQL
 * - OAuth providers (Google, GitHub)
 * - Organization plugin for multi-tenancy (workspaces)
 * - Session management
 */

export interface BetterAuthConfig {
  readonly db: PostgresDb;
  readonly baseUrl?: string;
  readonly secret?: string;
  readonly googleClientId?: string;
  readonly googleClientSecret?: string;
  readonly githubClientId?: string;
  readonly githubClientSecret?: string;
}

export const createBetterAuth = (config: BetterAuthConfig) => {
  const baseUrl =
    config.baseUrl ??
    Effect.runSync(parseEnvOptional(process.env.BETTER_AUTH_URL, "string")) ??
    "http://localhost:3000";
  const secret =
    config.secret ?? Effect.runSync(parseEnv(process.env.BETTER_AUTH_SECRET, "string"));

  // Get OAuth credentials from env if not provided
  const googleClientId =
    config.googleClientId ??
    Effect.runSync(parseEnvOptional(process.env.GOOGLE_CLIENT_ID, "string"));
  const googleClientSecret =
    config.googleClientSecret ??
    Effect.runSync(parseEnvOptional(process.env.GOOGLE_CLIENT_SECRET, "string"));
  const githubClientId =
    config.githubClientId ??
    Effect.runSync(parseEnvOptional(process.env.GITHUB_CLIENT_ID, "string"));
  const githubClientSecret =
    config.githubClientSecret ??
    Effect.runSync(parseEnvOptional(process.env.GITHUB_CLIENT_SECRET, "string"));

  // Create organization plugin
  // Note: Better Auth's organization plugin has a type issue where 'team' schema
  // is typed as potentially undefined, but BetterAuthPlugin expects it to be required.
  // This is a known issue in Better Auth's type definitions (v1.2.7+).
  // See: https://github.com/better-auth/better-auth/issues/3079
  // We use 'unknown' as a type-safe way to handle this mismatch.
  const orgPlugin: BetterAuthPlugin = organization({
    allowUserToCreateOrganization: () => true,
  }) as unknown as BetterAuthPlugin;

  return betterAuth({
    database: drizzleAdapter(config.db, {
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
    secret,
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
    },
    // Multi-tenancy via organizations plugin
    plugins: [orgPlugin],
  });
};

// Export types from better-auth for convenience
export type { User, Session } from "better-auth";
