import type { NotFoundError, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { User } from "../entities/user.ts"

export class UserRepository extends ServiceMap.Service<
  UserRepository,
  {
    findByEmail(email: string): Effect.Effect<User, NotFoundError | RepositoryError>
  }
>()("@domain/users/UserRepository") {}
