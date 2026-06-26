import { Effect } from "effect"
import type { OutboxEventWriterShape, OutboxWriteEvent } from "../../../events/src/outbox-event-writer.ts"

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
