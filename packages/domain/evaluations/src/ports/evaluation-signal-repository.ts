import type { NotFoundError, RepositoryError, SignalId, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"

// Tiny read-only view of the issues domain so evaluations can depend on the
// data it needs without importing `@domain/signals` directly and creating a
// cyclic workspace dependency.

export interface EvaluationSignal {
  readonly id: SignalId
  readonly projectId: string
  readonly name: string
  readonly description: string
  /** Non-null while the signal is manually resolved; pre-gates the reopen-on-occurrence claim. */
  readonly resolvedAt: Date | null
  /** Non-null while the signal is manually ignored; blocks monitoring. */
  readonly ignoredAt: Date | null
}

export class EvaluationSignalRepository extends Context.Service<
  EvaluationSignalRepository,
  {
    findById(id: SignalId): Effect.Effect<EvaluationSignal, NotFoundError | RepositoryError, SqlClient>
    /** Atomic reopen claim (see `SignalRepositoryShape.claimReopenOnOccurrence`); true only for the one writer that reopened and must emit `SignalRegressed`. */
    claimReopenOnOccurrence(input: {
      readonly signalId: SignalId
      readonly occurredAt: Date
      readonly now: Date
    }): Effect.Effect<boolean, RepositoryError, SqlClient>
  }
>()("@domain/evaluations/EvaluationSignalRepository") {}
