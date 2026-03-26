import type { Effect } from "effect"
import type { DomainEvent } from "./index.js"

export class RouteError extends Error {
  readonly eventName: string
  override readonly cause?: unknown

  constructor(message: string, eventName: string, cause?: unknown) {
    super(message)
    this.eventName = eventName
    this.cause = cause
  }
}

export type EventRouter = (event: DomainEvent) => Effect.Effect<void, RouteError>
