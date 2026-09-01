import type { ClickHouseClient } from "@clickhouse/client"
import type { ImportSourceAdapterRegistry } from "@domain/imports"
import type { Partner } from "@domain/partners"
import type { QueuePublisherShape, WorkflowQuerierShape, WorkflowStarterShape } from "@domain/queue"
import type { StorageDiskPort } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import type { PostgresClient } from "@platform/db-postgres"

export type { AppEnv, AuthContext, ProtectedEnv } from "@repo/operations"

/**
 * The verified caller on the private partner API, set by
 * `createPartnerAuthMiddleware`. Declared here rather than in
 * `@repo/operations` because `/v1/private/*` routes are plain Hono routes owned
 * by this app — they never reach the operations registry.
 */
declare module "hono" {
  interface ContextVariableMap {
    partner?: Partner
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
  workflowStarter: WorkflowStarterShape
  workflowQuerier: WorkflowQuerierShape
  storageDisk: StorageDiskPort
  importSourceAdapters: ImportSourceAdapterRegistry
  logTouchBuffer: boolean
  /** Override for tests that provide an in-memory admin Postgres client for auth lookups */
  adminDatabase?: PostgresClient
}
