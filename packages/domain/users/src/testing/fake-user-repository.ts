import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { User } from "../entities/user.ts"
import type { UserRepository } from "../ports/user-repository.ts"

type UserRepositoryShape = (typeof UserRepository)["Service"]

export const createFakeUserRepository = (overrides?: Partial<UserRepositoryShape>) => {
  const users = new Map<string, User>()
  const namesSet: { userId: string; name: string }[] = []

  const repository: UserRepositoryShape = {
    findByEmail: (email) => {
      const user = [...users.values()].find((u) => u.email === email)
      if (!user) return Effect.fail(new NotFoundError({ entity: "User", id: email }))
      return Effect.succeed(user)
    },

    setNameIfMissing: (params) =>
      Effect.sync(() => {
        if (params.name.trim()) {
          namesSet.push(params)
        }
      }),
    ...overrides,
  }

  return { repository, users, namesSet }
}
