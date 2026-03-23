import type { OutboxWriter } from "@domain/events"
import type { PostgresClient } from "./client.ts"
import { outboxEvents } from "./schema/index.ts"

export const createOutboxWriter = (client: PostgresClient): OutboxWriter => ({
  write: async (event) => {
    await client.db.insert(outboxEvents).values({
      id: event.id,
      eventName: event.eventName,
      aggregateId: event.aggregateId,
      organizationId: event.organizationId,
      payload: event.payload,
      occurredAt: event.occurredAt,
    })
  },
})
