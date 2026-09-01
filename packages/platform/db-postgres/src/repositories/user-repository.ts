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
  heardAboutUs: row.heardAboutUs ?? null,
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

      findOptionalByEmail: (email: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Compares the column as-is so `users_email_key` is usable. Every row is already
          // lowercase: Better Auth normalizes centrally in `internalAdapter.createUser`, and the
          // one path that bypasses it (`create`, for partner provisioning) is fed a normalized
          // address. Lowering the column instead would force a sequential scan.
          const [result] = yield* sqlClient.query((db) =>
            db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1),
          )
          return result ? toDomainUser(result) : null
        }),

      create: (params: {
        id: UserId
        name: string
        email: string
        emailVerified: boolean
        image?: string | null
        phoneNumber?: string | null
        jobTitle?: string | null
        heardAboutUs?: string | null
      }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [result] = yield* sqlClient.query((db) =>
            db
              .insert(users)
              .values({
                id: params.id,
                name: params.name,
                // Same normalization Better Auth applies in `internalAdapter.createUser`. This is
                // the one write path that skips it, and `findOptionalByEmail` relies on every
                // stored address being lowercase to match against the plain unique index.
                email: params.email.toLowerCase(),
                emailVerified: params.emailVerified,
                image: params.image ?? null,
                phoneNumber: params.phoneNumber ?? null,
                jobTitle: params.jobTitle ?? null,
                heardAboutUs: params.heardAboutUs ?? null,
              })
              .returning(),
          )
          if (!result) return yield* Effect.die(new Error("User insert returned no row"))
          return toDomainUser(result)
        }),

      update: ({
        userId,
        jobTitle,
        phoneNumber,
        heardAboutUs,
      }: {
        userId: string
        jobTitle?: string | undefined
        phoneNumber?: string | undefined
        heardAboutUs?: string | undefined
      }) =>
        Effect.gen(function* () {
          const trimmedJobTitle = jobTitle?.trim() || undefined
          const trimmedPhoneNumber = phoneNumber?.trim() || undefined
          const trimmedHeardAboutUs = heardAboutUs?.trim() || undefined
          if (!trimmedJobTitle && !trimmedPhoneNumber && !trimmedHeardAboutUs) return

          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .update(users)
              .set({
                ...(trimmedJobTitle ? { jobTitle: trimmedJobTitle } : {}),
                ...(trimmedPhoneNumber ? { phoneNumber: trimmedPhoneNumber } : {}),
                ...(trimmedHeardAboutUs ? { heardAboutUs: trimmedHeardAboutUs } : {}),
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
