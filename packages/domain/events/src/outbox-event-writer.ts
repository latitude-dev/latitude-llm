import type { SqlClient } from "@domain/shared"
import { type Effect, Context } from "effect"
import type { EventPayloads } from "./event-payloads.ts"

export type OutboxWriteEvent = {
  [K in keyof EventPayloads]: {
    readonly id?: string
    readonly eventName: K
    readonly aggregateType: string
    readonly aggregateId: string
    readonly organizationId: string
    readonly payload: EventPayloads[K]
    readonly occurredAt?: Date
  }
}[keyof EventPayloads]

export interface OutboxEventWriterShape {
  write(event: OutboxWriteEvent): Effect.Effect<void, unknown, SqlClient>
}

export class OutboxEventWriter extends Context.Service<OutboxEventWriter, OutboxEventWriterShape>()(
  "@domain/events/OutboxEventWriter",
) {}
