import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { User } from "../entities/user.ts"
import type { UserRepository } from "../ports/user-repository.ts"

type UserRepositoryShape = (typeof UserRepository)["Service"]

export const createFakeUserRepository = (overrides?: Partial<UserRepositoryShape>) => {
  const users = new Map<string, User>()
  const updates: { userId: string; jobTitle?: string; phoneNumber?: string; heardAboutUs?: string }[] = []

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

    update: (params) =>
      Effect.sync(() => {
        const trimmedJobTitle = params.jobTitle?.trim() || undefined
        const trimmedPhoneNumber = params.phoneNumber?.trim() || undefined
        const trimmedHeardAboutUs = params.heardAboutUs?.trim() || undefined
        if (!trimmedJobTitle && !trimmedPhoneNumber && !trimmedHeardAboutUs) return
        const changes = {
          ...(trimmedJobTitle ? { jobTitle: trimmedJobTitle } : {}),
          ...(trimmedPhoneNumber ? { phoneNumber: trimmedPhoneNumber } : {}),
          ...(trimmedHeardAboutUs ? { heardAboutUs: trimmedHeardAboutUs } : {}),
        }
        updates.push({ userId: params.userId, ...changes })
        const existing = users.get(params.userId)
        if (existing) {
          users.set(params.userId, { ...existing, ...changes })
        }
      }),

    updateNotificationPreferences: (params) =>
      Effect.sync(() => {
        const existing = users.get(params.userId)
        if (existing) {
          users.set(params.userId, { ...existing, notificationPreferences: params.preferences })
        }
      }),

    delete: (userId) =>
      Effect.sync(() => {
        users.delete(userId)
      }),
    ...overrides,
  }

  return { repository, users, updates }
}
