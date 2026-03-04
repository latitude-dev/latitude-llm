import type { RepositoryError } from "@domain/shared"
import type { Effect } from "effect"
import type { AuthIntent } from "../types.ts"

export interface AuthIntentRepository {
  save(intent: AuthIntent): Effect.Effect<void, RepositoryError>
  findById(id: string): Effect.Effect<AuthIntent | null, RepositoryError>
  markConsumed(input: {
    intentId: string
    createdOrganizationId?: string
  }): Effect.Effect<void, RepositoryError>
}
