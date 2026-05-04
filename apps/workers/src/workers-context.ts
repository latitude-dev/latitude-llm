import type { EventsPublisher } from "@domain/events"
import type { QueueConsumer, QueuePublishError, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import type { RedisClient } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"

/**
 * Shared infrastructure passed from {@link ../server.ts} into BullMQ workers so each worker
 * receives the same concrete clients instead of optionally re-resolving globals.
 */
export interface WorkersContext {
  readonly consumer: QueueConsumer
  readonly publisher: QueuePublisherShape
  readonly eventsPublisher: EventsPublisher<QueuePublishError>
  readonly workflowStarter: WorkflowStarterShape
  readonly postgresClient: PostgresClient
  readonly redisClient: RedisClient
  readonly clickhouseClient: ClickHouseClient
}
