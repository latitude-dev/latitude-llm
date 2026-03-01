import type { EventEnvelope, EventsPublisher } from "@domain/events";
import type { Queue } from "bullmq";
import { Context, Data, Effect } from "effect";

export class BullmqQueueAdapterTag extends Context.Tag("BullmqQueueAdapterTag")<
  BullmqQueueAdapterTag,
  {
    readonly type: "bullmq";
  }
>() {}

export const bullmqQueueAdapter = {
  type: "bullmq" as const,
};

export class QueuePublishError extends Data.TaggedError("QueuePublishError")<{
  readonly cause: unknown;
  readonly eventId: string;
}> {}

export interface BullmqEventsPublisherConfig {
  readonly queue: Queue;
}

const publishEffect = (
  queue: Queue,
  envelope: EventEnvelope,
): Effect.Effect<void, QueuePublishError> =>
  Effect.tryPromise({
    try: () =>
      queue.add(
        envelope.event.name,
        {
          eventId: envelope.id,
          workspaceId: envelope.event.workspaceId,
          payload: envelope.event.payload,
          occurredAt: envelope.occurredAt.toISOString(),
        },
        {
          jobId: envelope.id,
        },
      ),
    catch: (error) => new QueuePublishError({ cause: error, eventId: envelope.id }),
  });

export const createBullmqEventsPublisherEffect = (
  config: BullmqEventsPublisherConfig,
): Effect.Effect<EventsPublisher> =>
  Effect.succeed({
    publish: (envelope: EventEnvelope): Promise<void> =>
      Effect.runPromise(publishEffect(config.queue, envelope)),
  });

export const createBullmqEventsPublisher = (config: BullmqEventsPublisherConfig): EventsPublisher =>
  Effect.runSync(createBullmqEventsPublisherEffect(config));
