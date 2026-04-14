import { type Effect, ServiceMap } from "effect"

// Mirror the shared outbox writer service key locally so this package can compose
// `writeScoreUseCase` without adding a direct dependency on `@domain/events`.
export interface ScoreWriteOutboxEventWriterShape {
  write(event: unknown): Effect.Effect<void, unknown>
}

export class ScoreWriteOutboxEventWriter extends ServiceMap.Service<
  ScoreWriteOutboxEventWriter,
  ScoreWriteOutboxEventWriterShape
>()("@domain/events/OutboxEventWriter") {}
