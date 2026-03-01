import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRedisConnection } from "@platform/cache-redis";
import { createPostgresPool } from "@platform/db-postgres";
import { parseEnv } from "@platform/env";
import { createPollingOutboxConsumer } from "@platform/events-outbox";
import { createBullmqEventsPublisher } from "@platform/queue-bullmq";
import { createLogger } from "@repo/observability";
import { config as loadDotenv } from "dotenv";
import { Effect } from "effect";
import { createEventsWorker } from "./workers/events.js";

const nodeEnv = Effect.runSync(parseEnv(process.env.NODE_ENV, "string", "development"));
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const redisConnection = createRedisConnection();
const pgPool = createPostgresPool({ maxConnections: 10 });
const { queue: eventsQueue, worker: eventsWorker } = createEventsWorker(redisConnection);
const eventsPublisher = createBullmqEventsPublisher({ queue: eventsQueue });
const outboxConsumer = createPollingOutboxConsumer(
  {
    pool: pgPool,
    pollIntervalMs: 1000,
    batchSize: 100,
  },
  eventsPublisher,
);

const logger = createLogger("workers");

eventsWorker.on("ready", () => {
  outboxConsumer.start();

  logger.info("workers ready and outbox consumer started");
});

process.on("SIGINT", async () => {
  await outboxConsumer.stop();
  await pgPool.end();
  await eventsQueue.close();
  await eventsWorker.close();
  process.exit(0);
});
