import type { AuthIntent, AuthIntentRepository } from "@domain/auth"
import { toRepositoryError } from "@domain/shared"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import { authIntent } from "../schema/auth-intent.ts"

const parseAuthIntentData = (rawData: unknown): AuthIntent["data"] => {
  if (typeof rawData !== "object" || rawData === null) {
    return {}
  }

  const signupRaw = Reflect.get(rawData, "signup")
  const inviteRaw = Reflect.get(rawData, "invite")

  const signup =
    typeof signupRaw === "object" &&
    signupRaw !== null &&
    typeof Reflect.get(signupRaw, "name") === "string" &&
    typeof Reflect.get(signupRaw, "organizationName") === "string"
      ? {
          name: Reflect.get(signupRaw, "name"),
          organizationName: Reflect.get(signupRaw, "organizationName"),
        }
      : undefined

  const invite =
    typeof inviteRaw === "object" && inviteRaw !== null && typeof Reflect.get(inviteRaw, "organizationId") === "string"
      ? {
          organizationId: Reflect.get(inviteRaw, "organizationId") as string,
          organizationName: (Reflect.get(inviteRaw, "organizationName") as string) ?? "a workspace",
          inviterName: (Reflect.get(inviteRaw, "inviterName") as string) ?? "Someone",
        }
      : undefined

  return {
    ...(signup ? { signup } : {}),
    ...(invite ? { invite } : {}),
  }
}

const toDomainAuthIntent = (row: typeof authIntent.$inferSelect): AuthIntent => {
  const parsedData = parseAuthIntentData(row.data)

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
          data: { ...intent.data },
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

  findPendingInvitesByOrganizationId: (organizationId) =>
    Effect.tryPromise({
      try: async () => {
        const rows = await db
          .select({
            id: authIntent.id,
            email: authIntent.email,
            createdAt: authIntent.createdAt,
          })
          .from(authIntent)
          .where(
            and(
              eq(authIntent.type, "invite"),
              isNull(authIntent.consumedAt),
              gt(authIntent.expiresAt, new Date()),
              sql`${authIntent.data}->'invite'->>'organizationId' = ${organizationId}`,
            ),
          )

        return rows
      },
      catch: (error) => toRepositoryError(error, "findPendingInvitesByOrganizationId"),
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
