import type { ClickHouseClient } from "@clickhouse/client"
import type { Organization } from "@domain/organizations"
import type { QueuePublisherShape } from "@domain/queue"
import type { OrganizationId, UserId } from "@domain/shared"
import type { SpanRepository, TraceRepository } from "@domain/spans"
import type { RedisClient } from "@platform/cache-redis"
import type { PostgresClient, PostgresDb } from "@platform/db-postgres"
import type { Layer } from "effect"

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
  readonly method: "api-key"
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
 * Hooks for `createAnnotationsRoutes`.
 *
 * Project, score, and outbox repositories always use their Live layers with the request’s
 * `postgresClient`. API integration tests run real Postgres (PGlite) so those adapters work unchanged.
 *
 * Trace lookup is backed by ClickHouse; the same test harness does not run ClickHouse, so tests may
 * supply substitute `TraceRepository` / `SpanRepository` layers here. Production leaves these unset
 * and uses the default ClickHouse implementations.
 */
export interface AnnotationRoutesOptions {
  readonly traceRepositoryLayer?: Layer.Layer<TraceRepository>
  readonly spanRepositoryLayer?: Layer.Layer<SpanRepository>
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
  /** Passed only to annotation routes; keeps feature wiring out of global request context. */
  annotationRoutes?: AnnotationRoutesOptions
}
