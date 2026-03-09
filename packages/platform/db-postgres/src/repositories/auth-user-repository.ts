import type { AuthUser } from "@domain/auth"
import { NotFoundError, toRepositoryError } from "@domain/shared"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import { user } from "../schema/better-auth.ts"

const toAuthUser = (row: typeof user.$inferSelect): AuthUser => ({
  id: row.id,
  email: row.email,
  name: row.name,
})

export const createAuthUserPostgresRepository = (db: PostgresDb) => ({
  findByEmail: (email: string) =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () => db.select().from(user).where(eq(user.email, email)).limit(1),
        catch: (error) => toRepositoryError(error, "findByEmail"),
      })

      if (!result) {
        return yield* new NotFoundError({ entity: "AuthUser", id: email })
      }

      return toAuthUser(result)
    }),

  setNameIfMissing: ({ userId, name }: { userId: string; name: string }) =>
    Effect.tryPromise({
      try: async () => {
        if (!name.trim()) {
          return
        }

        await db
          .update(user)
          .set({
            name: name.trim(),
            updatedAt: new Date(),
          })
          .where(and(eq(user.id, userId), or(isNull(user.name), eq(user.name, ""), sql`trim(${user.name}) = ''`)))
      },
      catch: (error) => toRepositoryError(error, "setNameIfMissing"),
    }),
})
