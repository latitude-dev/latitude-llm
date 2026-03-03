import { GrantId, SubscriptionId } from "@domain/shared-kernel"
import { createGrant } from "@domain/subscriptions"
import { Effect } from "effect"
import { postgresSchema } from "../../index.ts"
import { SEED_ORG_ID } from "../organizations/index.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const SEED_SUBSCRIPTION_ID = SubscriptionId("ry0fy0n6qwszk3kk04zlfsuy")
const SEED_GRANT_SEATS_ID = GrantId("nkbbtxd5o7rbrr8miamhrnif")
const SEED_GRANT_RUNS_ID = GrantId("drkvcpudmblnqxgk48irmt94")

const seedSubscription: Seeder = {
  name: "subscriptions/hobby-plan",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: () =>
        ctx.db
          .insert(postgresSchema.subscription)
          .values({
            id: SEED_SUBSCRIPTION_ID,
            plan: "hobby",
            referenceId: SEED_ORG_ID,
            status: "active",
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            seats: 5,
          })
          .onConflictDoUpdate({
            target: postgresSchema.subscription.id,
            set: {
              plan: "hobby",
              status: "active",
              periodStart: new Date(),
              periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              seats: 5,
            },
          }),
      catch: (error) => new SeedError({ reason: "Failed to seed subscription", cause: error }),
    }).pipe(Effect.asVoid),
}

const seedGrants: Seeder = {
  name: "subscriptions/initial-grants",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const seatsGrant = createGrant({
        id: SEED_GRANT_SEATS_ID,
        organizationId: SEED_ORG_ID,
        subscriptionId: SEED_SUBSCRIPTION_ID,
        type: "seats",
        amount: 5,
      })
      yield* ctx.repositories.grant.save(seatsGrant)

      const runsGrant = createGrant({
        id: SEED_GRANT_RUNS_ID,
        organizationId: SEED_ORG_ID,
        subscriptionId: SEED_SUBSCRIPTION_ID,
        type: "runs",
        amount: 10_000,
      })
      yield* ctx.repositories.grant.save(runsGrant)
    }),
}

export const subscriptionSeeders: readonly Seeder[] = [seedSubscription, seedGrants]
