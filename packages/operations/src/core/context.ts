import type { ClickHouseClient } from "@clickhouse/client"
import type { ImportSourceAdapterRegistry } from "@domain/imports"
import type { Organization } from "@domain/organizations"
import type { QueuePublisherShape, WorkflowQuerierShape, WorkflowStarterShape } from "@domain/queue"
import type { StorageDiskPort } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import type { PostgresClient } from "@platform/db-postgres"
import type { AuthContext } from "../types.ts"

/**
 * Everything an execute-form operation needs to run, independent of transport.
 * Mirrors the `OrganizationScopedEnv` context variables the HTTP middleware
 * chain sets (minus `db`, which no operation consumes): the HTTP adapter builds
 * it from Hono's context, in-process callers (internal agent toolsets, workers)
 * build it from their own clients plus a loaded `Organization`.
 *
 * Tenancy lives here by construction — operations receive the organization
 * already resolved and clients already scoped; it is never part of the input.
 */
export interface OperationContext {
  readonly organization: Organization
  readonly auth: AuthContext
  readonly postgresClient: PostgresClient
  readonly clickhouse: ClickHouseClient
  readonly redis: RedisClient
  readonly queuePublisher: QueuePublisherShape
  readonly workflowStarter: WorkflowStarterShape
  readonly workflowQuerier: WorkflowQuerierShape
  readonly storageDisk: StorageDiskPort
  readonly importSourceAdapters: ImportSourceAdapterRegistry
}
