import {
  NotFoundError,
  type NotificationPreferences,
  SqlClient,
  type SqlClientShape,
  type UserId,
} from "@domain/shared"
import type { User } from "@domain/users"
import { UserRepository } from "@domain/users"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { users } from "../schema/better-auth.ts"

const toDomainUser = (row: typeof users.$inferSelect): User => ({
  id: row.id as UserId,
  email: row.email,
  name: row.name ?? null,
  jobTitle: row.jobTitle ?? null,
  phoneNumber: row.phoneNumber ?? null,
  emailVerified: row.emailVerified,
  image: row.image ?? null,
  role: row.role,
  notificationPreferences: (row.notificationPreferences as NotificationPreferences | null) ?? null,
  createdAt: row.createdAt,
})

/**
 * Live layer that pulls db from SqlClient
 */
export const UserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    return {
      findById: (userId: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) => db.select().from(users).where(eq(users.id, userId)).limit(1))
            .pipe(
              Effect.flatMap((results) => {
                const [result] = results
                if (!result) {
                  return Effect.fail(new NotFoundError({ entity: "User", id: userId }))
                }
                return Effect.succeed(toDomainUser(result))
              }),
            )
        }),

      findByEmail: (email: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) => db.select().from(users).where(eq(users.email, email)).limit(1))
            .pipe(
              Effect.flatMap((results) => {
                const [result] = results
                if (!result) {
                  return Effect.fail(new NotFoundError({ entity: "User", id: email }))
                }
                return Effect.succeed(toDomainUser(result))
              }),
            )
        }),

      update: ({
        userId,
        jobTitle,
        phoneNumber,
      }: {
        userId: string
        jobTitle?: string | undefined
        phoneNumber?: string | undefined
      }) =>
        Effect.gen(function* () {
          const trimmedJobTitle = jobTitle?.trim() || undefined
          const trimmedPhoneNumber = phoneNumber?.trim() || undefined
          if (!trimmedJobTitle && !trimmedPhoneNumber) return

          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .update(users)
              .set({
                ...(trimmedJobTitle ? { jobTitle: trimmedJobTitle } : {}),
                ...(trimmedPhoneNumber ? { phoneNumber: trimmedPhoneNumber } : {}),
                updatedAt: new Date(),
              })
              .where(eq(users.id, userId)),
          )
        }),

      updateNotificationPreferences: ({
        userId,
        preferences,
      }: {
        userId: string
        preferences: NotificationPreferences
      }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .update(users)
              .set({
                notificationPreferences: preferences,
                updatedAt: new Date(),
              })
              .where(eq(users.id, userId)),
          )
        }),

      delete: (userId: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient.query((db) => db.delete(users).where(eq(users.id, userId))).pipe(Effect.asVoid)
        }),
    }
  }),
)
