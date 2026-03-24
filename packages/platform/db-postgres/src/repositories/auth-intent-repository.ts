import { AuthIntentRepository } from "@domain/auth"
import { NotFoundError, type OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { authIntent } from "../schema/auth-intent.ts"

const parseAuthIntentData = (rawData: unknown): Record<string, unknown> => {
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

interface AuthIntentData {
  readonly signup?: {
    readonly name: string
    readonly organizationName: string
  }
  readonly invite?: {
    readonly organizationId: string
    readonly organizationName: string
    readonly inviterName: string
  }
}

interface AuthIntent {
  readonly id: string
  readonly type: "login" | "signup" | "invite"
  readonly email: string
  readonly data: AuthIntentData
  readonly existingAccountAtRequest: boolean
  readonly expiresAt: Date
  readonly consumedAt: Date | null
  readonly createdOrganizationId: string | null
}

const toDomainAuthIntent = (row: typeof authIntent.$inferSelect): AuthIntent => {
  const parsedData = parseAuthIntentData(row.data)

  return {
    id: row.id,
    type: row.type,
    email: row.email,
    data: parsedData as AuthIntentData,
    existingAccountAtRequest: row.existingAccountAtRequest,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdOrganizationId: row.createdOrganizationId,
  }
}

export const AuthIntentRepositoryLive = Layer.effect(
  AuthIntentRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      save: (intent: AuthIntent) =>
        sqlClient.query((db) =>
          db.insert(authIntent).values({
            id: intent.id,
            type: intent.type,
            email: intent.email,
            data: { ...intent.data },
            existingAccountAtRequest: intent.existingAccountAtRequest,
            expiresAt: intent.expiresAt,
            consumedAt: intent.consumedAt,
            createdOrganizationId: intent.createdOrganizationId,
          }),
        ),

      findById: (id: string) =>
        sqlClient
          .query((db) => db.select().from(authIntent).where(eq(authIntent.id, id)).limit(1))
          .pipe(
            Effect.flatMap((results) => {
              const [result] = results
              if (!result) {
                return Effect.fail(new NotFoundError({ entity: "AuthIntent", id }))
              }
              return Effect.succeed(toDomainAuthIntent(result))
            }),
          ),

      markConsumed: ({ intentId, createdOrganizationId }: { intentId: string; createdOrganizationId?: string }) =>
        sqlClient.query((db) =>
          db
            .update(authIntent)
            .set({
              consumedAt: new Date(),
              ...(createdOrganizationId ? { createdOrganizationId } : {}),
              updatedAt: new Date(),
            })
            .where(eq(authIntent.id, intentId)),
        ),

      findPendingInvitesByOrganizationId: (organizationId: OrganizationId) =>
        sqlClient.query((db) =>
          db
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
            ),
        ),
    }
  }),
)
