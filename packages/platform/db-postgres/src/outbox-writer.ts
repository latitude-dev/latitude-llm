import type { EventPayloads, OutboxWriter } from "@domain/events"
import { generateId, OutboxEventWriter, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { Operator, PostgresClient } from "./client.ts"
import { outboxEvents } from "./schema/outbox-events.ts"

const toOutboxInsertValues = (event: {
  readonly id?: string
  readonly eventName: string
  readonly aggregateType: string
  readonly aggregateId: string
  readonly organizationId: string
  readonly payload: unknown
  readonly occurredAt?: Date
}) => ({
  id: event.id ?? generateId(),
  eventName: event.eventName,
  aggregateType: event.aggregateType,
  aggregateId: event.aggregateId,
  organizationId: event.organizationId,
  payload: event.payload as EventPayloads[keyof EventPayloads],
  occurredAt: event.occurredAt ?? new Date(),
})

export const createOutboxWriter = (client: PostgresClient): OutboxWriter => ({
  write: async (event) => {
    await client.db.insert(outboxEvents).values(toOutboxInsertValues(event))
  },
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
