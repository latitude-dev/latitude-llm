import type { ClickHouseClient } from "@clickhouse/client"
import type { Organization } from "@domain/organizations"
import type { OrganizationId, UserId } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import type { PostgresDb } from "@platform/db-postgres"

type SharedContextVariables = {
  db: PostgresDb
  redis: RedisClient
  clickhouse: ClickHouseClient
}

/**
 * Authentication context set by the auth middleware.
 *
 * This context is available on all protected routes after successful
 * authentication. It provides the authenticated user's ID, the
 * organization context for the request, and the authentication method used.
 */
export interface AuthContext {
  /** The authenticated user's ID */
  readonly userId: UserId
  /** The organization ID for this request (from URL param or API key) */
  readonly organizationId: OrganizationId
  /** The authentication method that was used */
  readonly method: "jwt" | "api-key"
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
    db: SharedContextVariables["db"]
    redis: SharedContextVariables["redis"]
    clickhouse: SharedContextVariables["clickhouse"]
    organization?: Organization
  }
}

export type ProtectedEnv = {
  Variables: SharedContextVariables & {
    auth: AuthContext
  }
}

export type OrganizationScopedEnv = {
  Variables: ProtectedEnv["Variables"] & {
    organization: Organization
  }
}
