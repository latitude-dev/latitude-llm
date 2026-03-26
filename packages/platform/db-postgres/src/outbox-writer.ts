import type { OutboxWriter } from "@domain/events"
import { generateId } from "@domain/shared"
import type { PostgresClient } from "./client.ts"
import { outboxEvents } from "./schema/outbox-events.ts"

export const createOutboxWriter = (client: PostgresClient): OutboxWriter => ({
  write: async (event) => {
    await client.db.insert(outboxEvents).values({
      id: event.id ?? generateId(),
      eventName: event.eventName,
      aggregateId: event.aggregateId,
      organizationId: event.organizationId,
      payload: event.payload,
      occurredAt: event.occurredAt ?? new Date(),
    })
  },
})
