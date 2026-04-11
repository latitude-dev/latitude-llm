import { type Effect, ServiceMap } from "effect"
import type { EventPayloads } from "./index.ts"

/** Row shape for transactional outbox inserts. */
export interface OutboxWriteEvent {
  readonly id?: string
  readonly eventName: keyof EventPayloads
  readonly aggregateType: string
  readonly aggregateId: string
  readonly organizationId: string
  readonly payload: unknown
  readonly occurredAt?: Date
}

/** Plain implementation (e.g. `createOutboxWriter` in `@platform/db-postgres`) and Effect service backing. */
export interface OutboxEventWriterShape {
  write(event: OutboxWriteEvent): Effect.Effect<void, unknown>
}

export class OutboxEventWriter extends ServiceMap.Service<OutboxEventWriter, OutboxEventWriterShape>()(
  "@domain/events/OutboxEventWriter",
) {}
