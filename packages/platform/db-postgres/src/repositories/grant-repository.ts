import {
  GrantId,
  type GrantId as GrantIdType,
  NotFoundError,
  OrganizationId,
  SubscriptionId,
  type SubscriptionId as SubscriptionIdType,
  toRepositoryError,
} from "@domain/shared"
import type { Grant, GrantType } from "@domain/subscriptions"
import { and, eq, gt, gte, isNull, or } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import type { QuotaType } from "../schema/grants.ts"
import * as schema from "../schema/index.ts"

/**
 * Maps database quota type enum value to domain GrantType.
 */
const toDomainGrantType = (type: string): GrantType => {
  const typeMap: Record<string, GrantType> = {
    seats: "seats",
    runs: "runs",
    credits: "credits",
  }
  return typeMap[type] ?? "credits"
}

/**
 * Maps domain GrantType to database quota type enum value.
 */
const toDbGrantType = (type: GrantType): QuotaType => {
  return type
}

/**
 * Maps a database grant row to a domain Grant entity.
 */
const toDomainGrant = (row: typeof schema.grants.$inferSelect): Grant => ({
  id: GrantId(row.id),
  organizationId: OrganizationId(row.organizationId),
  subscriptionId: SubscriptionId(row.subscriptionId),
  type: toDomainGrantType(row.type),
  amount: Number(row.amount),
  balance: Number(row.balance),
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Maps a domain Grant entity to a database insert row.
 */
const toInsertRow = (grant: Grant): typeof schema.grants.$inferInsert => ({
  id: grant.id,
  organizationId: grant.organizationId,
  subscriptionId: grant.subscriptionId,
  type: toDbGrantType(grant.type),
  amount: grant.amount,
  balance: grant.balance,
  expiresAt: grant.expiresAt,
  source: "subscription",
})

/**
 * Creates a Postgres implementation of the GrantRepository port.
 * Org-level isolation is enforced by the RLS context set via runCommand.
 */
export const createGrantPostgresRepository = (db: PostgresDb) => ({
  findById: (id: GrantIdType) =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () => db.select().from(schema.grants).where(eq(schema.grants.id, id)).limit(1),
        catch: (error) => toRepositoryError(error, "findById"),
      })

      if (!result) {
        return yield* new NotFoundError({ entity: "Grant", id })
      }

      return toDomainGrant(result)
    }),

  findAll: () =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () => db.select().from(schema.grants),
        catch: (error) => toRepositoryError(error, "findAll"),
      })

      return results.map(toDomainGrant)
    }),

  findBySubscriptionId: (subscriptionId: SubscriptionIdType) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () => db.select().from(schema.grants).where(eq(schema.grants.subscriptionId, subscriptionId)),
        catch: (error) => toRepositoryError(error, "findBySubscriptionId"),
      })

      return results.map(toDomainGrant)
    }),

  findActiveByType: (type: GrantType) =>
    Effect.gen(function* () {
      const now = new Date()
      const results = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(schema.grants)
            .where(
              and(
                eq(schema.grants.type, toDbGrantType(type)),
                gt(schema.grants.balance, 0),
                or(isNull(schema.grants.expiresAt), gte(schema.grants.expiresAt, now)),
              ),
            ),
        catch: (error) => toRepositoryError(error, "findActiveByType"),
      })

      return results.map(toDomainGrant)
    }),

  findAllActive: () =>
    Effect.gen(function* () {
      const now = new Date()
      const results = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(schema.grants)
            .where(
              and(gt(schema.grants.balance, 0), or(isNull(schema.grants.expiresAt), gte(schema.grants.expiresAt, now))),
            ),
        catch: (error) => toRepositoryError(error, "findAllActive"),
      })

      return results.map(toDomainGrant)
    }),

  save: (grant: Grant) =>
    Effect.gen(function* () {
      const row = toInsertRow(grant)

      yield* Effect.tryPromise({
        try: () =>
          db
            .insert(schema.grants)
            .values(row)
            .onConflictDoUpdate({
              target: schema.grants.id,
              set: {
                balance: row.balance,
                expiresAt: row.expiresAt,
                updatedAt: new Date(),
              },
            }),
        catch: (error) => toRepositoryError(error, "save"),
      })
    }),

  saveMany: (grants: readonly Grant[]) =>
    Effect.gen(function* () {
      if (grants.length === 0) {
        return
      }

      const rows = grants.map(toInsertRow)

      yield* Effect.tryPromise({
        try: () => db.insert(schema.grants).values(rows),
        catch: (error) => toRepositoryError(error, "saveMany"),
      })
    }),

  revokeBySubscription: (subscriptionId: SubscriptionIdType) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(schema.grants)
            .set({ balance: 0, updatedAt: new Date() })
            .where(eq(schema.grants.subscriptionId, subscriptionId)),
        catch: (error) => toRepositoryError(error, "revokeBySubscription"),
      })
    }),

  delete: (id: GrantIdType) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => db.delete(schema.grants).where(eq(schema.grants.id, id)),
        catch: (error) => toRepositoryError(error, "delete"),
      })
    }),

  deleteBySubscription: (subscriptionId: SubscriptionIdType) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => db.delete(schema.grants).where(eq(schema.grants.subscriptionId, subscriptionId)),
        catch: (error) => toRepositoryError(error, "deleteBySubscription"),
      })
    }),
})
