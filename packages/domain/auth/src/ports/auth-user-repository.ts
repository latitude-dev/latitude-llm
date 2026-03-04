import type { RepositoryError } from "@domain/shared"
import type { Effect } from "effect"

export interface AuthUser {
  readonly id: string
  readonly email: string
  readonly name: string | null
}

export interface AuthUserRepository {
  findByEmail(email: string): Effect.Effect<AuthUser | null, RepositoryError>
  setNameIfMissing(input: { userId: string; name: string }): Effect.Effect<void, RepositoryError>
}
