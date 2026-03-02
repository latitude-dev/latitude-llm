import type { Effect } from "effect";
import type { RepositoryError } from "../errors.ts";
import type { User } from "../user.ts";

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
  readonly findByEmail: (email: string) => Effect.Effect<User | null, RepositoryError>;
}
