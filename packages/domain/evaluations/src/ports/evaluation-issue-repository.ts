import type { SignalId, NotFoundError, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"

// Tiny read-only view of the issues domain so evaluations can depend on the
// data it needs without importing `@domain/signals` directly and creating a
// cyclic workspace dependency.

export interface EvaluationSignal {
  readonly id: SignalId
  readonly projectId: string
  readonly name: string
  readonly description: string
}

export class EvaluationSignalRepository extends Context.Service<
  EvaluationSignalRepository,
  {
    findById(id: SignalId): Effect.Effect<EvaluationSignal, NotFoundError | RepositoryError, SqlClient>
  }
>()("@domain/evaluations/EvaluationSignalRepository") {}
