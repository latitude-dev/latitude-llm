import { NotFoundError, UserId, toRepositoryError } from "@domain/shared"
import type { User } from "@domain/users"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import { user } from "../schema/index.ts"

/**
 * Maps a database user row to a domain User entity.
 */
const toDomainUser = (row: typeof user.$inferSelect): User => ({
  id: UserId(row.id),
  email: row.email,
  name: row.name ?? null,
  emailVerified: row.emailVerified,
  image: row.image ?? null,
  role: row.role,
  banned: row.banned,
  createdAt: row.createdAt,
})

/**
 * Creates a Postgres implementation of the UserRepository port.
 */
export const createUserPostgresRepository = (db: PostgresDb) => ({
  findByEmail: (email: string) =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () => db.select().from(user).where(eq(user.email, email)).limit(1),
        catch: (error) => toRepositoryError(error, "findByEmail"),
      })

      if (!result) {
        return yield* new NotFoundError({ entity: "User", id: email })
      }

      return toDomainUser(result)
    }),
})
