import {
  NotFoundError,
  OrganizationId,
  SubscriptionId,
  type SubscriptionId as SubscriptionIdType,
  toRepositoryError,
} from "@domain/shared"
import type { Plan, Subscription } from "@domain/subscriptions"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import * as schema from "../schema/index.ts"

/**
 * Maps database plan name to domain Plan type.
 */
const toDomainPlan = (plan: string): Plan => {
  const planMap: Record<string, Plan> = {
    hobby: "HobbyV3",
    team: "TeamV4",
    enterprise: "EnterpriseV1",
    scale: "ScaleV1",
    hobby_v3: "HobbyV3",
    team_v4: "TeamV4",
    enterprise_v1: "EnterpriseV1",
    scale_v1: "ScaleV1",
  }
  return planMap[plan.toLowerCase()] ?? "HobbyV3"
}

/**
 * Maps a Better Auth subscription row to a domain Subscription entity.
 *
 * Better Auth stores subscriptions with referenceId (which maps to organizationId).
 */
const toDomainSubscription = (row: typeof schema.subscription.$inferSelect): Subscription => ({
  id: SubscriptionId(row.id),
  organizationId: OrganizationId(row.referenceId),
  plan: toDomainPlan(row.plan),
  trialEndsAt: row.trialEnd,
  cancelledAt: row.canceledAt ?? row.cancelAt,
  createdAt: row.periodStart ?? new Date(),
  updatedAt: new Date(),
})

/**
 * Creates a Postgres implementation of the SubscriptionRepository port.
 *
 * This adapter queries the Better Auth subscription table managed by
 * the Better Auth Stripe plugin. Org-level isolation is enforced by the
 * RLS context set via runCommand.
 */
export const createSubscriptionPostgresRepository = (db: PostgresDb) => ({
  findById: (id: SubscriptionIdType) =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () => db.select().from(schema.subscription).where(eq(schema.subscription.id, id)).limit(1),
        catch: (error) => toRepositoryError(error, "findById"),
      })

      if (!result) {
        return yield* new NotFoundError({ entity: "Subscription", id })
      }

      return toDomainSubscription(result)
    }),

  findActive: () =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(schema.subscription)
            .where(
              and(inArray(schema.subscription.status, ["active", "trialing"]), isNull(schema.subscription.canceledAt)),
            )
            .orderBy(desc(schema.subscription.periodStart))
            .limit(1),
        catch: (error) => toRepositoryError(error, "findActive"),
      })

      if (!result) {
        return yield* new NotFoundError({ entity: "Subscription", id: "active" })
      }

      return toDomainSubscription(result)
    }),

  findAll: () =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () => db.select().from(schema.subscription).orderBy(desc(schema.subscription.periodStart)),
        catch: (error) => toRepositoryError(error, "findAll"),
      })

      return results.map(toDomainSubscription)
    }),

  save: (_subscription: Subscription) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(
        "Direct subscription save not supported with Better Auth Stripe. Use Better Auth API instead.",
      )
      return
    }),

  delete: (_id: SubscriptionIdType) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(
        "Direct subscription delete not supported with Better Auth Stripe. Use Better Auth API instead.",
      )
      return
    }),

  exists: () =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () => db.select({ id: schema.subscription.id }).from(schema.subscription).limit(1),
        catch: (error) => toRepositoryError(error, "exists"),
      })

      return result !== undefined
    }),
})
