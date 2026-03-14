import { SEED_GRANT_RUNS_ID, SEED_GRANT_SEATS_ID, SEED_ORG_ID, SEED_SUBSCRIPTION_ID } from "@domain/shared"
import { createGrant } from "@domain/subscriptions"
import { Effect } from "effect"
import { postgresSchema } from "../../index.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const HOBBY_PLAN_SEATS = 5
const HOBBY_PLAN_RUNS = 10_000

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
            seats: HOBBY_PLAN_SEATS,
          })
          .onConflictDoUpdate({
            target: postgresSchema.subscription.id,
            set: {
              plan: "hobby",
              status: "active",
              periodStart: new Date(),
              periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              seats: HOBBY_PLAN_SEATS,
            },
          }),
      catch: (error) => new SeedError({ reason: "Failed to seed subscription", cause: error }),
    }).pipe(
      Effect.tap(() => Effect.sync(() => console.log(`  -> subscription: hobby (${HOBBY_PLAN_SEATS} seats)`))),
      Effect.asVoid,
    ),
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
        amount: HOBBY_PLAN_SEATS,
      })
      yield* ctx.repositories.grant.save(seatsGrant)

      const runsGrant = createGrant({
        id: SEED_GRANT_RUNS_ID,
        organizationId: SEED_ORG_ID,
        subscriptionId: SEED_SUBSCRIPTION_ID,
        type: "runs",
        amount: HOBBY_PLAN_RUNS,
      })
      yield* ctx.repositories.grant.save(runsGrant)
      console.log(`  -> grants: seats=${HOBBY_PLAN_SEATS}, runs=${HOBBY_PLAN_RUNS}`)
    }),
}

export const subscriptionSeeders: readonly Seeder[] = [seedSubscription, seedGrants]
