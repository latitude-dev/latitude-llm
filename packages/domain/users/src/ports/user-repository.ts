import type { RepositoryError } from "@domain/shared"
import type { Effect } from "effect"
import type { User } from "../entities/user.ts"

/**
 * User repository port - interface for user persistence operations.
 *
 * This port abstracts user data access so the domain doesn't depend
 * on specific database implementations.
 */
export interface UserRepository {
  /**
   * Find a user by their email address.
   */
  readonly findByEmail: (email: string) => Effect.Effect<User | null, RepositoryError>
}
