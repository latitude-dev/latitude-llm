import { EffectService } from "@repo/effect-service"
import type { Effect } from "effect"

export class OutboxEventWriter extends EffectService<
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
