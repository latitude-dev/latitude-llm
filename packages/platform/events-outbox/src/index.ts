import type { EventEnvelope, EventsPublisher } from "@domain/events";
import { Effect, Fiber, Result, Schedule, ServiceMap } from "effect";
import type { Pool, PoolClient } from "pg";

export class EventsOutboxAdapterTag extends ServiceMap.Service<
  EventsOutboxAdapterTag,
  {
    readonly type: "outbox";
  }
>()("EventsOutboxAdapterTag") {}

export const eventsOutboxAdapter = {
  type: "outbox" as const,
};

export interface OutboxEventRow {
  id: string;
  event_name: string;
  aggregate_id: string;
  workspace_id: string;
  payload: Record<string, unknown>;
  published: boolean;
  published_at: string | null;
  occurred_at: Date;
  created_at: Date;
}

export interface PollingOutboxConsumerConfig {
  readonly pool: Pool;
  readonly pollIntervalMs: number;
  readonly batchSize: number;
}

const SELECT_UNPUBLISHED_EVENTS = `
  SELECT 
    id,
    event_name,
    aggregate_id,
    workspace_id,
    payload,
    published,
    published_at,
    occurred_at,
    created_at
  FROM outbox_events
  WHERE published = false
  ORDER BY created_at ASC
  LIMIT $1
  FOR UPDATE SKIP LOCKED
`;

const MARK_EVENTS_PUBLISHED = `
  UPDATE outbox_events
  SET published = true, published_at = NOW()
  WHERE id = ANY($1::uuid[])
`;

const processBatchEffect = (
  client: PoolClient,
  publisher: EventsPublisher,
  batchSize: number,
): Effect.Effect<number, unknown, never> =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise(() =>
      client.query<OutboxEventRow>(SELECT_UNPUBLISHED_EVENTS, [batchSize]),
    );

    if (result.rows.length === 0) {
      return 0;
    }

    const processedIds: string[] = [];

    for (const row of result.rows) {
      const envelope: EventEnvelope = {
        id: row.id,
        event: {
          name: row.event_name,
          workspaceId: row.workspace_id,
          payload: row.payload,
        },
        occurredAt: row.occurred_at,
      };

      const publishResult = yield* Effect.result(
        Effect.tryPromise(() => publisher.publish(envelope)),
      );

      if (Result.isSuccess(publishResult)) {
        processedIds.push(row.id);
      } else {
        yield* Effect.logError(`Failed to publish event ${row.id}: ${publishResult.failure}`);
      }
    }

    if (processedIds.length > 0) {
      yield* Effect.tryPromise(() => client.query(MARK_EVENTS_PUBLISHED, [processedIds]));
    }

    return processedIds.length;
  });

const pollEffect = (
  config: PollingOutboxConsumerConfig,
  publisher: EventsPublisher,
): Effect.Effect<number, unknown, never> =>
  Effect.gen(function* () {
    const client = yield* Effect.tryPromise(() => config.pool.connect());

    yield* Effect.tryPromise(() => client.query("BEGIN"));

    const processedCount = yield* processBatchEffect(client, publisher, config.batchSize);

    yield* Effect.tryPromise(() => client.query("COMMIT"));

    if (processedCount > 0) {
      yield* Effect.logInfo(`Processed ${processedCount} events`);
    }

    client.release();

    return processedCount;
  });

export const createPollingOutboxConsumerEffect = (
  config: PollingOutboxConsumerConfig,
  publisher: EventsPublisher,
): Effect.Effect<{ start: () => void; stop: () => Promise<void> }, never, never> =>
  Effect.gen(function* () {
    let fiber: Fiber.Fiber<void, unknown> | null = null;

    const schedule = Schedule.spaced(config.pollIntervalMs);

    return {
      start: (): void => {
        if (fiber !== null) return;

        const pollingEffect = Effect.repeat(pollEffect(config, publisher), schedule).pipe(
          Effect.asVoid,
        );

        fiber = Effect.runSync(Effect.forkDetach(pollingEffect, { startImmediately: true }));

        Effect.runSync(Effect.logInfo("Polling outbox consumer started"));
      },
      stop: async (): Promise<void> => {
        if (fiber === null) return;

        await Effect.runPromise(Fiber.interrupt(fiber));
        fiber = null;
        await Effect.runPromise(Effect.logInfo("Polling outbox consumer stopped"));
      },
    };
  });

export const createPollingOutboxConsumer = (
  config: PollingOutboxConsumerConfig,
  publisher: EventsPublisher,
): { start: () => void; stop: () => Promise<void> } =>
  Effect.runSync(createPollingOutboxConsumerEffect(config, publisher));
