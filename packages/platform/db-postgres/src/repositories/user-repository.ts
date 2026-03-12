import { NotFoundError, SqlClient, type SqlClientShape, type UserId } from "@domain/shared"
import { UserRepository } from "@domain/users"
import type { User } from "@domain/users"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { user } from "../schema/index.ts"

const toDomainUser = (row: typeof user.$inferSelect): User => ({
  id: row.id as UserId,
  email: row.email,
  name: row.name ?? null,
  emailVerified: row.emailVerified,
  image: row.image ?? null,
  role: row.role,
  banned: row.banned,
  createdAt: row.createdAt,
})

/**
 * Live layer that pulls db from SqlClient
 */
export const UserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findByEmail: (email: string) =>
        sqlClient
          .query((db) => db.select().from(user).where(eq(user.email, email)).limit(1))
          .pipe(
            Effect.flatMap((results) => {
              const [result] = results
              if (!result) {
                return Effect.fail(new NotFoundError({ entity: "User", id: email }))
              }
              return Effect.succeed(toDomainUser(result))
            }),
          ),

      setNameIfMissing: ({ userId, name }: { userId: string; name: string }) =>
        Effect.gen(function* () {
          if (!name.trim()) return

          yield* sqlClient.query((db) =>
            db
              .update(user)
              .set({
                name: name.trim(),
                updatedAt: new Date(),
              })
              .where(and(eq(user.id, userId), or(isNull(user.name), eq(user.name, ""), sql`trim(${user.name}) = ''`))),
          )
        }),
    }
  }),
)
