import type { AuthIntent, AuthIntentRepository } from "@domain/auth"
import { toRepositoryError } from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import { authIntent } from "../schema/auth-intent.ts"

const toDomainAuthIntent = (row: typeof authIntent.$inferSelect): AuthIntent => {
  const parsedData = (row.data ?? {}) as AuthIntent["data"]

  return {
    id: row.id,
    type: row.type,
    email: row.email,
    data: parsedData,
    existingAccountAtRequest: row.existingAccountAtRequest,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdOrganizationId: row.createdOrganizationId,
  }
}

export const createAuthIntentPostgresRepository = (db: PostgresDb): AuthIntentRepository => ({
  save: (intent) =>
    Effect.tryPromise({
      try: async () => {
        await db.insert(authIntent).values({
          id: intent.id,
          type: intent.type,
          email: intent.email,
          data: intent.data as Record<string, unknown>,
          existingAccountAtRequest: intent.existingAccountAtRequest,
          expiresAt: intent.expiresAt,
          consumedAt: intent.consumedAt,
          createdOrganizationId: intent.createdOrganizationId,
        })
      },
      catch: (error) => toRepositoryError(error, "save"),
    }),

  findById: (id) =>
    Effect.gen(function* () {
      const row = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(authIntent)
            .where(eq(authIntent.id, id))
            .limit(1)
            .then((rows) => rows[0]),
        catch: (error) => toRepositoryError(error, "findById"),
      })

      return row ? toDomainAuthIntent(row) : null
    }),

  markConsumed: ({ intentId, createdOrganizationId }) =>
    Effect.tryPromise({
      try: async () => {
        await db
          .update(authIntent)
          .set({
            consumedAt: new Date(),
            ...(createdOrganizationId ? { createdOrganizationId } : {}),
            updatedAt: new Date(),
          })
          .where(eq(authIntent.id, intentId))
      },
      catch: (error) => toRepositoryError(error, "markConsumed"),
    }),
})
