import type { NotFoundError, RepositoryError, SqlClient } from "@domain/shared"
import type { Effect } from "effect"
import { ServiceMap } from "effect"
import type { User } from "../entities/user.ts"

// UserRepository Service with all methods needed by use cases
export class UserRepository extends ServiceMap.Service<
  UserRepository,
  {
    findByEmail: (email: string) => Effect.Effect<User, NotFoundError | RepositoryError, SqlClient>
    setNameIfMissing: (params: { userId: string; name: string }) => Effect.Effect<void, RepositoryError, SqlClient>
    delete: (userId: string) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/users/UserRepository") {}
