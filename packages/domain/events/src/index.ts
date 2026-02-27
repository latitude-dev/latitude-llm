export interface EventEnvelope {
  readonly name: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
}
