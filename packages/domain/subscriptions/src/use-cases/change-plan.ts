import { type GrantId, type NotFoundError, type OrganizationId, type RepositoryError, SqlClient } from "@domain/shared"
import { Data, Effect } from "effect"
import { createGrant, type Grant, type GrantType } from "../entities/grant.ts"
import type { Plan } from "../entities/plan.ts"
import type { Subscription } from "../entities/subscription.ts"
import { GrantRepository } from "../ports/grant-repository.ts"
import { SubscriptionRepository } from "../ports/subscription-repository.ts"

export interface ChangePlanInput {
  readonly organizationId: OrganizationId
  readonly newPlan: Plan
  readonly grantIds: {
    seats: GrantId
    runs: GrantId
    credits: GrantId
  }
}

export class NoActiveSubscriptionError extends Data.TaggedError("NoActiveSubscriptionError")<{
  readonly organizationId: OrganizationId
}> {
  readonly httpStatus = 404
  readonly httpMessage = "No active subscription found"
}

export class SamePlanError extends Data.TaggedError("SamePlanError")<{
  readonly currentPlan: Plan
  readonly requestedPlan: Plan
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Already on the requested plan"
}

export class PlanDowngradeError extends Data.TaggedError("PlanDowngradeError")<{
  readonly currentPlan: Plan
  readonly requestedPlan: Plan
  readonly reason: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.reason
  }
}

export type ChangePlanError =
  | RepositoryError
  | NotFoundError
  | NoActiveSubscriptionError
  | SamePlanError
  | PlanDowngradeError

/**
 * Result of changing a plan.
 */
export interface ChangePlanResult {
  readonly subscription: Subscription
  readonly previousGrants: readonly Grant[]
  readonly newGrants: readonly Grant[]
}

/**
 * Change the subscription plan for an organization.
 *
 * This use case:
 * 1. Validates the new plan is different from current
 * 2. Finds the active subscription
 * 3. Revokes existing grants for the old plan
 * 4. Issues new grants based on new plan
 * 5. Updates the subscription with new plan
 * 6. Returns the updated subscription and grant changes
 */
export const changePlan = (input: ChangePlanInput) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const subscriptionRepository = yield* SubscriptionRepository
        const grantRepository = yield* GrantRepository

        const subscription = yield* subscriptionRepository
          .findActive()
          .pipe(
            Effect.catchTag("NotFoundError", () =>
              Effect.fail(new NoActiveSubscriptionError({ organizationId: input.organizationId })),
            ),
          )

        if (subscription.plan === input.newPlan) {
          return yield* new SamePlanError({
            currentPlan: subscription.plan,
            requestedPlan: input.newPlan,
          })
        }

        const previousGrants = yield* grantRepository.findBySubscriptionId(subscription.id)

        yield* grantRepository.revokeBySubscription(subscription.id)

        const grantConfigs: Array<{ type: GrantType; amount: number }> = [
          { type: "seats", amount: 10 },
          { type: "runs", amount: 1000 },
          { type: "credits", amount: 500 },
        ]

        const grantIdByType: Record<GrantType, GrantId> = {
          seats: input.grantIds.seats,
          runs: input.grantIds.runs,
          credits: input.grantIds.credits,
        }

        const newGrants = grantConfigs.map((config) =>
          createGrant({
            id: grantIdByType[config.type],
            organizationId: input.organizationId,
            subscriptionId: subscription.id,
            type: config.type,
            amount: config.amount,
          }),
        )

        yield* grantRepository.saveMany(newGrants)

        const updatedSubscription: Subscription = {
          ...subscription,
          plan: input.newPlan,
          updatedAt: new Date(),
        }

        yield* subscriptionRepository.save(updatedSubscription)

        return {
          subscription: updatedSubscription,
          previousGrants,
          newGrants,
        }
      }),
    )
  })
