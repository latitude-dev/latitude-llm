import {
  GrantId,
  type GrantId as GrantIdType,
  NotFoundError,
  OrganizationId,
  SqlClient,
  type SqlClientShape,
  SubscriptionId,
  type SubscriptionId as SubscriptionIdType,
} from "@domain/shared"
import type { Grant, GrantSource, GrantType } from "@domain/subscriptions"
import { GrantRepository } from "@domain/subscriptions"
import { and, eq, gt, gte, isNull, or } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { grants } from "../schema/index.ts"

const toDomainGrantType = (type: string): GrantType => {
  const typeMap: Record<string, GrantType> = {
    seats: "seats",
    runs: "runs",
    credits: "credits",
  }
  return typeMap[type] ?? "credits"
}

const toDbGrantType = (type: GrantType) => type

const toDomainGrant = (row: typeof grants.$inferSelect): Grant => ({
  id: GrantId(row.id),
  organizationId: OrganizationId(row.organizationId),
  subscriptionId: SubscriptionId(row.subscriptionId),
  type: toDomainGrantType(row.type),
  source: row.source as GrantSource,
  amount: Number(row.amount),
  balance: Number(row.balance),
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const toGrantInsertRow = (grant: Grant): typeof grants.$inferInsert => ({
  id: grant.id,
  organizationId: grant.organizationId,
  subscriptionId: grant.subscriptionId,
  type: toDbGrantType(grant.type),
  source: grant.source,
  amount: grant.amount,
  balance: grant.balance,
  expiresAt: grant.expiresAt,
})

export const GrantRepositoryLive = Layer.effect(
  GrantRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: (id: GrantIdType) =>
        sqlClient
          .query((db) => db.select().from(grants).where(eq(grants.id, id)).limit(1))
          .pipe(
            Effect.flatMap((results) => {
              const [result] = results
              if (!result) {
                return Effect.fail(new NotFoundError({ entity: "Grant", id }))
              }
              return Effect.succeed(toDomainGrant(result))
            }),
          ),

      findAll: () =>
        sqlClient.query((db) => db.select().from(grants)).pipe(Effect.map((results) => results.map(toDomainGrant))),

      findBySubscriptionId: (subscriptionId: SubscriptionIdType) =>
        sqlClient
          .query((db) => db.select().from(grants).where(eq(grants.subscriptionId, subscriptionId)))
          .pipe(Effect.map((results) => results.map(toDomainGrant))),

      findActiveByType: (type: GrantType) =>
        Effect.gen(function* () {
          const now = new Date()
          return yield* sqlClient
            .query((db) =>
              db
                .select()
                .from(grants)
                .where(
                  and(
                    eq(grants.type, toDbGrantType(type)),
                    gt(grants.balance, 0),
                    or(isNull(grants.expiresAt), gte(grants.expiresAt, now)),
                  ),
                ),
            )
            .pipe(Effect.map((results) => results.map(toDomainGrant)))
        }),

      findAllActive: () =>
        Effect.gen(function* () {
          const now = new Date()
          return yield* sqlClient
            .query((db) =>
              db
                .select()
                .from(grants)
                .where(and(gt(grants.balance, 0), or(isNull(grants.expiresAt), gte(grants.expiresAt, now)))),
            )
            .pipe(Effect.map((results) => results.map(toDomainGrant)))
        }),

      save: (grant: Grant) =>
        Effect.gen(function* () {
          const row = toGrantInsertRow(grant)

          yield* sqlClient.query((db) =>
            db
              .insert(grants)
              .values(row)
              .onConflictDoUpdate({
                target: grants.id,
                set: {
                  balance: row.balance,
                  expiresAt: row.expiresAt,
                  updatedAt: new Date(),
                },
              }),
          )
        }),

      saveMany: (grants_: readonly Grant[]) =>
        Effect.gen(function* () {
          if (grants_.length === 0) return

          const rows = grants_.map(toGrantInsertRow)

          yield* sqlClient.query((db) => db.insert(grants).values(rows))
        }),

      revokeBySubscription: (subscriptionId: SubscriptionIdType) =>
        sqlClient.query((db) =>
          db.update(grants).set({ balance: 0, updatedAt: new Date() }).where(eq(grants.subscriptionId, subscriptionId)),
        ),

      delete: (id: GrantIdType) => sqlClient.query((db) => db.delete(grants).where(eq(grants.id, id))),

      deleteBySubscription: (subscriptionId: SubscriptionIdType) =>
        sqlClient.query((db) => db.delete(grants).where(eq(grants.subscriptionId, subscriptionId))),
    }
  }),
)
