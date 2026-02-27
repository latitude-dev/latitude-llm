import type { DomainEvent } from "@domain/shared-kernel";

export interface EventEnvelope<TEvent extends DomainEvent = DomainEvent> {
  readonly id: string;
  readonly event: TEvent;
  readonly occurredAt: Date;
}

export interface DomainOutbox {
  append(event: EventEnvelope): Promise<void>;
}

export const createEventEnvelope = <TEvent extends DomainEvent>(params: {
  event: TEvent;
  id: string;
  occurredAt?: Date;
}): EventEnvelope<TEvent> => {
  return {
    id: params.id,
    event: params.event,
    occurredAt: params.occurredAt ?? new Date(),
  };
};
