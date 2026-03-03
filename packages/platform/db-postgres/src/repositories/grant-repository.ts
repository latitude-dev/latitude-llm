import { type GrantId, type OrganizationId, type SubscriptionId, toRepositoryError } from "@domain/shared-kernel"
import type { Grant, GrantRepository, GrantType } from "@domain/subscriptions"
import { eq } from "drizzle-orm"
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
  id: row.id as Grant["id"],
  organizationId: row.organizationId as Grant["organizationId"],
  subscriptionId: row.subscriptionId as Grant["subscriptionId"],
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
  // createdAt and updatedAt are set by defaultNow()
  // source is required in schema, defaulting to "subscription"
  source: "subscription",
})

/**
 * Creates a Postgres implementation of the GrantRepository port.
 */
export const createGrantPostgresRepository = (db: PostgresDb): GrantRepository => ({
  findById: (id: GrantId) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          db.query.grants.findFirst({
            where: { id },
          }),
        catch: (error) => toRepositoryError(error, "findById"),
      })

      return result ? toDomainGrant(result) : null
    }),

  findByOrganizationId: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () =>
          db.query.grants.findMany({
            where: { organizationId },
          }),
        catch: (error) => toRepositoryError(error, "findByOrganizationId"),
      })

      return results.map(toDomainGrant)
    }),

  findBySubscriptionId: (subscriptionId: SubscriptionId) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () =>
          db.query.grants.findMany({
            where: { subscriptionId },
          }),
        catch: (error) => toRepositoryError(error, "findBySubscriptionId"),
      })

      return results.map(toDomainGrant)
    }),

  findActiveByType: (organizationId: OrganizationId, type: GrantType) =>
    Effect.gen(function* () {
      const now = new Date()
      const results = yield* Effect.tryPromise({
        try: () =>
          db.query.grants.findMany({
            where: {
              organizationId,
              type: toDbGrantType(type),
              balance: { gt: 0 },
              OR: [{ expiresAt: { isNull: true } }, { expiresAt: { gte: now } }],
            },
          }),
        catch: (error) => toRepositoryError(error, "findActiveByType"),
      })

      return results.map(toDomainGrant)
    }),

  findAllActive: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const now = new Date()
      const results = yield* Effect.tryPromise({
        try: () =>
          db.query.grants.findMany({
            where: {
              organizationId,
              balance: { gt: 0 },
              OR: [{ expiresAt: { isNull: true } }, { expiresAt: { gte: now } }],
            },
          }),
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

  revokeBySubscription: (subscriptionId: SubscriptionId) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(schema.grants)
            .set({
              balance: 0,
              updatedAt: new Date(),
            })
            .where(eq(schema.grants.subscriptionId, subscriptionId)),
        catch: (error) => toRepositoryError(error, "revokeBySubscription"),
      })
    }),

  delete: (id: GrantId) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => db.delete(schema.grants).where(eq(schema.grants.id, id)),
        catch: (error) => toRepositoryError(error, "delete"),
      })
    }),

  deleteBySubscription: (subscriptionId: SubscriptionId) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => db.delete(schema.grants).where(eq(schema.grants.subscriptionId, subscriptionId)),
        catch: (error) => toRepositoryError(error, "deleteBySubscription"),
      })
    }),
})
