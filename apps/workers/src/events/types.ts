import type { DomainEvent, EventPayloads } from "@domain/events"
import type { Effect } from "effect"

export type { EventRouter } from "@domain/events"

export type EventHandlerMap = {
  [E in keyof EventPayloads]: (event: DomainEvent<E, EventPayloads[E]>) => Effect.Effect<void, unknown>
}
