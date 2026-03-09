import type { NotFoundError, RepositoryError } from "@domain/shared"
import type { Effect } from "effect"
import type { AuthIntent } from "../types.ts"

export interface PendingInvite {
  readonly id: string
  readonly email: string
  readonly createdAt: Date
}

export interface AuthIntentRepository {
  save(intent: AuthIntent): Effect.Effect<void, RepositoryError>
  findById(id: string): Effect.Effect<AuthIntent, NotFoundError | RepositoryError>
  findPendingInvitesByOrganizationId(organizationId: string): Effect.Effect<readonly PendingInvite[], RepositoryError>
  markConsumed(input: {
    intentId: string
    createdOrganizationId?: string
  }): Effect.Effect<void, RepositoryError>
}
