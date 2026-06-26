import { Effect } from "effect"
import type { OutboxEventWriterShape, OutboxWriteEvent } from "@domain/events"

const writtenEvents: OutboxWriteEvent[] = []

export const createFakeOutboxEventWriter = () => {
  const outboxEventWriter: OutboxEventWriterShape = {
    write: (event) =>
      Effect.sync(() => {
        writtenEvents.push(event)
      }),
  }

  return { outboxEventWriter, writtenEvents }
}
