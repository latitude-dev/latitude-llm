import { type OrganizationId, type SubscriptionId, toRepositoryError } from "@domain/shared-kernel"
import type { Plan, Subscription, SubscriptionRepository } from "@domain/subscriptions"
import { and, desc, eq, isNull, or } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import * as schema from "../schema/index.ts"

/**
 * Maps database plan name to domain Plan type.
 */
const toDomainPlan = (plan: string): Plan => {
  // Map from Better Auth plan names to domain Plan types
  const planMap: Record<string, Plan> = {
    hobby: "HobbyV3",
    team: "TeamV4",
    enterprise: "EnterpriseV1",
    scale: "ScaleV1",
    // Support both old and new naming conventions
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
  id: row.id as Subscription["id"],
  organizationId: row.referenceId as Subscription["organizationId"],
  plan: toDomainPlan(row.plan),
  trialEndsAt: row.trialEnd,
  // Better Auth uses multiple cancellation fields - map them appropriately
  cancelledAt: row.canceledAt ?? row.cancelAt,
  // Use periodStart as a proxy for createdAt if not available
  createdAt: row.periodStart ?? new Date(),
  updatedAt: new Date(), // Better Auth doesn't track updatedAt
})

/**
 * Creates a Postgres implementation of the SubscriptionRepository port.
 *
 * This adapter queries the Better Auth subscription table managed by
 * the Better Auth Stripe plugin.
 */
export const createSubscriptionPostgresRepository = (db: PostgresDb): SubscriptionRepository => ({
  findById: (id: SubscriptionId) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          db.query.subscription.findFirst({
            where: eq(schema.subscription.id, id as string),
          }),
        catch: (error) => toRepositoryError(error, "findById"),
      })

      return result ? toDomainSubscription(result) : null
    }),

  findActiveByOrganizationId: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          db.query.subscription.findFirst({
            where: and(
              eq(schema.subscription.referenceId, organizationId as string),
              or(eq(schema.subscription.status, "active"), eq(schema.subscription.status, "trialing")),
              isNull(schema.subscription.canceledAt),
            ),
            orderBy: desc(schema.subscription.periodStart),
          }),
        catch: (error) => toRepositoryError(error, "findActiveByOrganizationId"),
      })

      return result ? toDomainSubscription(result) : null
    }),

  findByOrganizationId: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () =>
          db.query.subscription.findMany({
            where: eq(schema.subscription.referenceId, organizationId as string),
            orderBy: desc(schema.subscription.periodStart),
          }),
        catch: (error) => toRepositoryError(error, "findByOrganizationId"),
      })

      return results.map(toDomainSubscription)
    }),

  save: (_subscription: Subscription) =>
    Effect.gen(function* () {
      // Note: With Better Auth Stripe plugin, subscriptions are managed by Better Auth.
      // The domain should not directly create/update subscriptions.
      // Instead, use Better Auth's subscription.upgrade() API.
      yield* Effect.logWarning(
        "Direct subscription save not supported with Better Auth Stripe. Use Better Auth API instead.",
      )
      return
    }),

  delete: (_id: SubscriptionId) =>
    Effect.gen(function* () {
      // Note: With Better Auth Stripe plugin, subscriptions are managed by Better Auth.
      // The domain should not directly delete subscriptions.
      // Instead, use Better Auth's subscription.cancel() API.
      yield* Effect.logWarning(
        "Direct subscription delete not supported with Better Auth Stripe. Use Better Auth API instead.",
      )
      return
    }),

  existsForOrganization: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          db.query.subscription.findFirst({
            where: eq(schema.subscription.referenceId, organizationId as string),
          }),
        catch: (error) => toRepositoryError(error, "existsForOrganization"),
      })

      return result !== null
    }),
})
