import { type Effect, ServiceMap } from "effect"

export class OutboxEventWriter extends ServiceMap.Service<
  OutboxEventWriter,
  {
    write(event: {
      readonly id?: string
      readonly eventName: string
      readonly aggregateType: string
      readonly aggregateId: string
      readonly organizationId: string
      readonly payload: unknown
      readonly occurredAt?: Date
    }): Effect.Effect<void, unknown>
  }
>()("@domain/shared/OutboxEventWriter") {}
