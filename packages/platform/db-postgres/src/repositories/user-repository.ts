import type { User, UserRepository } from "@domain/shared-kernel"
import { toRepositoryError } from "@domain/shared-kernel"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import * as schema from "../schema/index.ts"

/**
 * Maps a database user row to a domain User entity.
 */
const toDomainUser = (row: typeof schema.user.$inferSelect): User => ({
  id: row.id as User["id"],
  email: row.email,
  name: row.name ?? null,
  emailVerified: row.emailVerified,
  image: row.image ?? null,
  role: row.role as User["role"],
  banned: row.banned,
  createdAt: row.createdAt,
})

/**
 * Creates a Postgres implementation of the UserRepository port.
 */
export const createUserPostgresRepository = (db: PostgresDb): UserRepository => ({
  findByEmail: (email: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          db.query.user.findFirst({
            where: eq(schema.user.email, email),
          }),
        catch: (error) => toRepositoryError(error, "findByEmail"),
      })

      return result ? toDomainUser(result) : null
    }),
})
