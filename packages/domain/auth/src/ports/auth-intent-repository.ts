import type { NotFoundError, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { AuthIntent } from "../types.ts"

interface PendingInvite {
  readonly id: string
  readonly email: string
  readonly createdAt: Date
}

// AuthIntentRepository Service with all methods needed by use cases
export class AuthIntentRepository extends ServiceMap.Service<
  AuthIntentRepository,
  {
    save: (intent: AuthIntent) => Effect.Effect<void, RepositoryError>
    findById: (id: string) => Effect.Effect<AuthIntent, NotFoundError | RepositoryError>
    markConsumed: (params: { intentId: string; createdOrganizationId?: string }) => Effect.Effect<void, RepositoryError>
    findPendingInvitesByOrganizationId: () => Effect.Effect<readonly PendingInvite[], RepositoryError, never>
  }
>()("@domain/auth/AuthIntentRepository") {}
