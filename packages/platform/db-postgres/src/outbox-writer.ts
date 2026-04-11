import type { EventPayloads, OutboxEventWriterShape, OutboxWriteEvent } from "@domain/events"
import { OutboxEventWriter } from "@domain/events"
import { generateId, SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { Operator, PostgresClient } from "./client.ts"
import { outboxEvents } from "./schema/outbox-events.ts"

const toOutboxInsertValues = (event: OutboxWriteEvent) => ({
  id: event.id ?? generateId(),
  eventName: event.eventName,
  aggregateType: event.aggregateType,
  aggregateId: event.aggregateId,
  organizationId: event.organizationId,
  payload: event.payload as EventPayloads[keyof EventPayloads],
  occurredAt: event.occurredAt ?? new Date(),
})

export const createOutboxWriter = (client: PostgresClient): OutboxEventWriterShape => ({
  write: (event) =>
    Effect.tryPromise({
      try: () => client.db.insert(outboxEvents).values(toOutboxInsertValues(event)),
      catch: (cause) => toRepositoryError(cause, "outboxWriter.write"),
    }).pipe(Effect.asVoid),
})

export const OutboxEventWriterLive = Layer.effect(
  OutboxEventWriter,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      write: (event) =>
        sqlClient.query((db) => db.insert(outboxEvents).values(toOutboxInsertValues(event))).pipe(Effect.asVoid),
    }
  }),
)
