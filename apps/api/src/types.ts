import type { ClickHouseClient } from "@clickhouse/client"
import type { Organization } from "@domain/organizations"
import type { QueuePublisherShape } from "@domain/queue"
import type { OrganizationId, UserId } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import type { PostgresClient, PostgresDb } from "@platform/db-postgres"

/**
 * Authentication context set by the auth middleware.
 *
 * Discriminated on `method`:
 *
 * - `api-key` — request authenticated via an organization-scoped API key
 *   (Bearer `lak_…` or a legacy unprefixed UUID). `userId` is a synthetic
 *   `api-key:<keyId>` value because API keys aren't tied to a real user.
 * - `oauth` — request authenticated via an OAuth access token (`Bearer loa_…`)
 *   issued through the Better Auth `mcp` plugin on the web app. Carries the
 *   real `userId` of the granting user, the `oauthClientId` of the MCP client,
 *   the granted `scopes`, and the `expiresAt` of the access token.
 */
export type AuthContext =
  | {
      readonly method: "api-key"
      /** Synthetic `api-key:<keyId>` — API keys aren't tied to a real user. */
      readonly userId: UserId
      readonly organizationId: OrganizationId
    }
  | {
      readonly method: "oauth"
      /** Real user id of the user who granted consent to the OAuth client. */
      readonly userId: UserId
      /** Org the OAuth client was bound to at consent time. */
      readonly organizationId: OrganizationId
      /** `oauth_applications.client_id` of the requesting MCP client. */
      readonly oauthClientId: string
      readonly scopes: ReadonlyArray<string>
      /** Underlying access token's `accessTokenExpiresAt`. */
      readonly expiresAt: Date
    }

/**
 * Root-level Hono env. Every request has access to these variables
 * after the shared-context middleware runs in `registerRoutes`.
 */
export type AppEnv = {
  Variables: {
    db: PostgresDb
    postgresClient: PostgresClient
    redis: RedisClient
    clickhouse: ClickHouseClient
    queuePublisher: QueuePublisherShape
  }
}

/**
 * Hono module augmentation for type-safe context variables.
 *
 * This augments Hono's ContextVariableMap to include our custom 'auth'
 * variable, enabling type-safe access without casting.
 *
 * @see https://hono.dev/docs/guides/middleware#context-variables
 */
declare module "hono" {
  interface ContextVariableMap {
    auth?: AuthContext
    db: AppEnv["Variables"]["db"]
    postgresClient: AppEnv["Variables"]["postgresClient"]
    redis: AppEnv["Variables"]["redis"]
    clickhouse: AppEnv["Variables"]["clickhouse"]
    queuePublisher: AppEnv["Variables"]["queuePublisher"]
    organization?: Organization
  }
}

export type ProtectedEnv = {
  Variables: AppEnv["Variables"] & {
    auth: AuthContext
  }
}

export type OrganizationScopedEnv = {
  Variables: ProtectedEnv["Variables"] & {
    organization: Organization
  }
}

/**
 * Dependencies needed to wire up the API app.
 * Both the real server and the test harness provide these.
 */
export interface ApiOptions {
  database: PostgresClient
  clickhouse: ClickHouseClient
  redis: RedisClient
  queuePublisher: QueuePublisherShape
  logTouchBuffer: boolean
  /** Override for tests that provide an in-memory admin Postgres client for auth lookups */
  adminDatabase?: PostgresClient
}
