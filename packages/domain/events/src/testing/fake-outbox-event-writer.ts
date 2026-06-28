import type { OutboxEventWriterShape, OutboxWriteEvent } from "@domain/events"
import { Effect } from "effect"

export const createFakeOutboxEventWriter = () => {
  const writtenEvents: OutboxWriteEvent[] = []

  const outboxEventWriter: OutboxEventWriterShape = {
    write: (event) =>
      Effect.sync(() => {
        writtenEvents.push(event)
      }),
  }

  return { outboxEventWriter, writtenEvents }
}
