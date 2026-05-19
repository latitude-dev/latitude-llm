import type { NotFoundError, NotificationPreferences, RepositoryError, SqlClient } from "@domain/shared"
import type { Effect } from "effect"
import { Context } from "effect"
import type { User } from "../entities/user.ts"

export class UserRepository extends Context.Service<
  UserRepository,
  {
    findById: (userId: string) => Effect.Effect<User, NotFoundError | RepositoryError, SqlClient>
    findByEmail: (email: string) => Effect.Effect<User, NotFoundError | RepositoryError, SqlClient>
    update: (params: {
      userId: string
      jobTitle?: string | undefined
      phoneNumber?: string | undefined
    }) => Effect.Effect<void, RepositoryError, SqlClient>
    updateNotificationPreferences: (params: {
      userId: string
      preferences: NotificationPreferences
    }) => Effect.Effect<void, RepositoryError, SqlClient>
    delete: (userId: string) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/users/UserRepository") {}
