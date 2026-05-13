import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { User } from "../entities/user.ts"
import type { UserRepository } from "../ports/user-repository.ts"

type UserRepositoryShape = (typeof UserRepository)["Service"]

export const createFakeUserRepository = (overrides?: Partial<UserRepositoryShape>) => {
  const users = new Map<string, User>()
  const namesSet: { userId: string; name: string }[] = []

  const jobTitlesSet: { userId: string; jobTitle: string }[] = []

  const repository: UserRepositoryShape = {
    findById: (userId) => {
      const user = users.get(userId)
      if (!user) return Effect.fail(new NotFoundError({ entity: "User", id: userId }))
      return Effect.succeed(user)
    },

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

    setJobTitle: (params) =>
      Effect.sync(() => {
        const trimmed = params.jobTitle.trim()
        if (!trimmed) return
        jobTitlesSet.push({ userId: params.userId, jobTitle: trimmed })
        const existing = users.get(params.userId)
        if (existing) {
          users.set(params.userId, { ...existing, jobTitle: trimmed })
        }
      }),

    delete: (userId) =>
      Effect.sync(() => {
        users.delete(userId)
      }),
    ...overrides,
  }

  return { repository, users, namesSet, jobTitlesSet }
}
