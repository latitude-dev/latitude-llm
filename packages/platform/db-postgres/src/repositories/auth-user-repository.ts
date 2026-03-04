import type { AuthUser, AuthUserRepository } from "@domain/auth"
import { toRepositoryError } from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import { user } from "../schema/better-auth.ts"

const toAuthUser = (row: typeof user.$inferSelect): AuthUser => ({
  id: row.id,
  email: row.email,
  name: row.name,
})

export const createAuthUserPostgresRepository = (db: PostgresDb): AuthUserRepository => ({
  findByEmail: (email) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(user)
            .where(eq(user.email, email))
            .limit(1)
            .then((rows) => rows[0]),
        catch: (error) => toRepositoryError(error, "findByEmail"),
      })

      return result ? toAuthUser(result) : null
    }),

  setNameIfMissing: ({ userId, name }) =>
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
          .where(and(eq(user.id, userId), isNull(user.name)))
      },
      catch: (error) => toRepositoryError(error, "setNameIfMissing"),
    }),
})
