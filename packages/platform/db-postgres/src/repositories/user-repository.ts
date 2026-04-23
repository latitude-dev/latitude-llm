import { NotFoundError, SqlClient, type SqlClientShape, type UserId } from "@domain/shared"
import type { User } from "@domain/users"
import { UserRepository } from "@domain/users"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { users } from "../schema/better-auth.ts"

const toDomainUser = (row: typeof users.$inferSelect): User => ({
  id: row.id as UserId,
  email: row.email,
  name: row.name ?? null,
  emailVerified: row.emailVerified,
  image: row.image ?? null,
  role: row.role,
  createdAt: row.createdAt,
})

/**
 * Live layer that pulls db from SqlClient
 */
export const UserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    yield* SqlClient // assert dependency is available; do not capture

    return {
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

      setNameIfMissing: ({ userId, name }: { userId: string; name: string }) =>
        Effect.gen(function* () {
          if (!name.trim()) return

          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .update(users)
              .set({
                name: name.trim(),
                updatedAt: new Date(),
              })
              .where(
                and(eq(users.id, userId), or(isNull(users.name), eq(users.name, ""), sql`trim(${users.name}) = ''`)),
              ),
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
