import type { NotFoundError, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { AuthIntent } from "../types.ts"

export interface PendingInvite {
  readonly id: string
  readonly email: string
  readonly createdAt: Date
}

export class AuthIntentRepository extends ServiceMap.Service<
  AuthIntentRepository,
  {
    save(intent: AuthIntent): Effect.Effect<void, RepositoryError>
    findById(id: string): Effect.Effect<AuthIntent, NotFoundError | RepositoryError>
    findPendingInvitesByOrganizationId(organizationId: string): Effect.Effect<readonly PendingInvite[], RepositoryError>
    markConsumed(input: { intentId: string; createdOrganizationId?: string }): Effect.Effect<void, RepositoryError>
  }
>()("@domain/auth/AuthIntentRepository") {}
