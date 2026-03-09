import type { NotFoundError, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"

export interface AuthUser {
  readonly id: string
  readonly email: string
  readonly name: string | null
}

export class AuthUserRepository extends ServiceMap.Service<
  AuthUserRepository,
  {
    findByEmail(email: string): Effect.Effect<AuthUser, NotFoundError | RepositoryError>
    setNameIfMissing(input: { userId: string; name: string }): Effect.Effect<void, RepositoryError>
  }
>()("@domain/auth/AuthUserRepository") {}
