import type { NotFoundError, NotificationPreferences, RepositoryError, SqlClient, UserId } from "@domain/shared"
import type { Effect } from "effect"
import { Context } from "effect"
import type { User } from "../entities/user.ts"

export class UserRepository extends Context.Service<
  UserRepository,
  {
    findById: (userId: string) => Effect.Effect<User, NotFoundError | RepositoryError, SqlClient>
    findByEmail: (email: string) => Effect.Effect<User, NotFoundError | RepositoryError, SqlClient>
    /**
     * Looks a user up by email, returning `null` when there is none. Use this
     * over `findByEmail` when absence is a normal outcome rather than an error
     * — checking whether an address is already taken, for instance.
     *
     * Normalizes the address before matching, since every stored email is
     * lowercase (Better Auth normalizes in `internalAdapter.createUser`, and
     * {@link create} is given a normalized address).
     */
    findOptionalByEmail: (email: string) => Effect.Effect<User | null, RepositoryError, SqlClient>
    /**
     * Inserts a user row directly, bypassing Better Auth. Only for flows that
     * mint an account without a sign-up (partner provisioning); everything
     * user-initiated goes through Better Auth so its hooks fire.
     */
    create: (params: {
      id: UserId
      name: string
      email: string
      emailVerified: boolean
      image?: string | null
      phoneNumber?: string | null
      jobTitle?: string | null
      /**
       * Where the account came from. Partner provisioning sets the partner's
       * name here, since a provisioned user never sees the onboarding form that
       * would otherwise ask.
       */
      heardAboutUs?: string | null
    }) => Effect.Effect<User, RepositoryError, SqlClient>
    update: (params: {
      userId: string
      jobTitle?: string | undefined
      phoneNumber?: string | undefined
      heardAboutUs?: string | undefined
    }) => Effect.Effect<void, RepositoryError, SqlClient>
    updateNotificationPreferences: (params: {
      userId: string
      preferences: NotificationPreferences
    }) => Effect.Effect<void, RepositoryError, SqlClient>
    delete: (userId: string) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/users/UserRepository") {}
