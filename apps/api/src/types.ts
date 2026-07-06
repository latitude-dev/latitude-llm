import type { ClickHouseClient } from "@clickhouse/client"
import type { QueuePublisherShape, WorkflowQuerierShape, WorkflowStarterShape } from "@domain/queue"
import type { StorageDiskPort } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import type { PostgresClient } from "@platform/db-postgres"

export type { AppEnv, AuthContext, OrganizationScopedEnv, ProtectedEnv } from "@repo/operations"

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
  logTouchBuffer: boolean
  /** Override for tests that provide an in-memory admin Postgres client for auth lookups */
  adminDatabase?: PostgresClient
}
