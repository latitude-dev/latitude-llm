import type { NotFoundError, RepositoryError } from "@domain/shared"
import type { Effect } from "effect"
import { ServiceMap } from "effect"
import type { User } from "../entities/user.ts"

// UserRepository Service with all methods needed by use cases
export class UserRepository extends ServiceMap.Service<
  UserRepository,
  {
    findByEmail: (email: string) => Effect.Effect<User, NotFoundError | RepositoryError>
    setNameIfMissing: (params: { userId: string; name: string }) => Effect.Effect<void, RepositoryError>
    delete: (userId: string) => Effect.Effect<void, RepositoryError>
  }
>()("@domain/users/UserRepository") {}
