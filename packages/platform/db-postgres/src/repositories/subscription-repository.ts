import {
  NotFoundError,
  OrganizationId,
  RepositoryError,
  SqlClient,
  type SqlClientShape,
  SubscriptionId,
  type SubscriptionId as SubscriptionIdType,
} from "@domain/shared"
import type { Plan, Subscription } from "@domain/subscriptions"
import { SubscriptionRepository } from "@domain/subscriptions"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { subscription } from "../schema/index.ts"

// ── Subscription helpers ─────────────────────────────────────────────────────

const PLAN_MAP: Record<string, Plan> = {
  hobby: "HobbyV3",
  team: "TeamV4",
  enterprise: "EnterpriseV1",
  scale: "ScaleV1",
  hobby_v3: "HobbyV3",
  team_v4: "TeamV4",
  enterprise_v1: "EnterpriseV1",
  scale_v1: "ScaleV1",
}

const toDomainPlan = (plan: string): Effect.Effect<Plan, RepositoryError> => {
  const mapped = PLAN_MAP[plan.toLowerCase()]
  if (!mapped) {
    return Effect.fail(
      new RepositoryError({ cause: new Error(`Unknown subscription plan: "${plan}"`), operation: "toDomainPlan" }),
    )
  }
  return Effect.succeed(mapped)
}

const toDomainSubscription = (row: typeof subscription.$inferSelect) =>
  Effect.map(
    toDomainPlan(row.plan),
    (plan): Subscription => ({
      id: SubscriptionId(row.id),
      organizationId: OrganizationId(row.referenceId),
      plan,
      status: row.status,
      periodStart: row.periodStart ?? null,
      trialEndsAt: row.trialEnd ?? null,
      cancelledAt: row.canceledAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  )

// ── Subscription Repository Live Layer ───────────────────────────────────────

export const SubscriptionRepositoryLive = Layer.effect(
  SubscriptionRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: (id: SubscriptionIdType) =>
        Effect.gen(function* () {
          const results = yield* sqlClient.query((db) =>
            db.select().from(subscription).where(eq(subscription.id, id)).limit(1),
          )
          const [result] = results
          if (!result) return yield* new NotFoundError({ entity: "Subscription", id })
          return yield* toDomainSubscription(result)
        }),

      findActive: () =>
        Effect.gen(function* () {
          const results = yield* sqlClient.query((db) =>
            db
              .select()
              .from(subscription)
              .where(and(inArray(subscription.status, ["active", "trialing"]), isNull(subscription.canceledAt)))
              .orderBy(desc(subscription.periodStart))
              .limit(1),
          )
          const [result] = results
          if (!result) return yield* new NotFoundError({ entity: "Subscription", id: "active" })
          return yield* toDomainSubscription(result)
        }),

      findAll: () =>
        Effect.gen(function* () {
          const results = yield* sqlClient.query((db) =>
            db.select().from(subscription).orderBy(desc(subscription.periodStart)),
          )
          return yield* Effect.all(results.map(toDomainSubscription))
        }),

      save: (_sub: Subscription) =>
        Effect.logWarning(
          "Direct subscription save not supported with Better Auth Stripe. Use Better Auth API instead.",
        ),

      delete: (_id: SubscriptionIdType) =>
        Effect.logWarning(
          "Direct subscription delete not supported with Better Auth Stripe. Use Better Auth API instead.",
        ),

      exists: () =>
        sqlClient
          .query((db) => db.select({ id: subscription.id }).from(subscription).limit(1))
          .pipe(Effect.map((results) => results.length > 0)),
    }
  }),
)
