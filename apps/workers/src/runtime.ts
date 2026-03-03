import type { RedisConnection } from "@platform/cache-redis";
import { createPollingOutboxConsumer } from "@platform/events-outbox";
import { createBullmqEventsPublisher } from "@platform/queue-bullmq";
import { createLogger } from "@repo/observability";
import type { Queue, Worker } from "bullmq";
import type { Pool } from "pg";
import { getPostgresPool, getRedisConnection } from "./clients.ts";
import { createEventsWorker } from "./workers/events.ts";

interface WorkersLogger {
  info: (message: string) => unknown;
}

interface EventsPublisher {
  publish: (envelope: unknown) => Promise<void>;
}

interface OutboxConsumerLike {
  start: () => void;
  stop: () => Promise<void>;
}

interface WorkersRuntimeDependencies {
  readonly redisConnection?: RedisConnection;
  readonly pgPool?: Pool;
  readonly eventsQueue?: Queue;
  readonly eventsWorker?: Worker;
  readonly eventsPublisher?: EventsPublisher;
  readonly outboxConsumer?: OutboxConsumerLike;
  readonly logger?: WorkersLogger;
}

export interface WorkersRuntime {
  readonly eventsQueue: Queue;
  readonly eventsWorker: Worker;
  readonly outboxConsumer: OutboxConsumerLike;
  readonly onReady: () => void;
  readonly stop: () => Promise<void>;
}

export const createWorkersRuntime = (dependencies: WorkersRuntimeDependencies = {}): WorkersRuntime => {
  const pgPool = dependencies.pgPool ?? getPostgresPool(10);

  const createdWorkers =
    dependencies.eventsQueue && dependencies.eventsWorker
      ? {
          queue: dependencies.eventsQueue,
          worker: dependencies.eventsWorker,
        }
      : createEventsWorker(dependencies.redisConnection ?? getRedisConnection());
  const eventsQueue = createdWorkers.queue;
  const eventsWorker = createdWorkers.worker;

  const eventsPublisher =
    dependencies.eventsPublisher ??
    createBullmqEventsPublisher({
      queue: eventsQueue,
    });

  const outboxConsumer =
    dependencies.outboxConsumer ??
    createPollingOutboxConsumer(
      {
        pool: pgPool,
        pollIntervalMs: 1000,
        batchSize: 100,
      },
      eventsPublisher,
    );

  const logger = dependencies.logger ?? createLogger("workers");

  return {
    eventsQueue,
    eventsWorker,
    outboxConsumer,
    onReady: () => {
      outboxConsumer.start();
      logger.info("workers ready and outbox consumer started");
    },
    stop: async () => {
      await outboxConsumer.stop();
      await pgPool.end();
      await eventsQueue.close();
      await eventsWorker.close();
    },
  };
};
