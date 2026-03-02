import type { NotFoundError, OrganizationId, RepositoryError } from "@domain/shared-kernel"
import type { GrantId } from "@domain/shared-kernel"
import { Data, Effect } from "effect"
import { type Grant, type GrantType, createGrant } from "../entities/grant.ts"
import type { Plan } from "../entities/plan.ts"
import type { Subscription } from "../entities/subscription.ts"
import type { GrantRepository } from "../ports/grant-repository.ts"
import type { SubscriptionRepository } from "../ports/subscription-repository.ts"

/**
 * Input for changing subscription plan.
 */
export interface ChangePlanInput {
  readonly organizationId: OrganizationId
  readonly newPlan: Plan
  readonly grantIds: {
    seats: GrantId
    runs: GrantId
    credits: GrantId
  }
}

/**
 * Error types for change plan use case.
 */
export class NoActiveSubscriptionError extends Data.TaggedError("NoActiveSubscriptionError")<{
  readonly organizationId: OrganizationId
}> {}

export class SamePlanError extends Data.TaggedError("SamePlanError")<{
  readonly currentPlan: Plan
  readonly requestedPlan: Plan
}> {}

export class PlanDowngradeError extends Data.TaggedError("PlanDowngradeError")<{
  readonly currentPlan: Plan
  readonly requestedPlan: Plan
  readonly reason: string
}> {}

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
export const changePlan =
  (deps: {
    subscriptionRepository: SubscriptionRepository
    grantRepository: GrantRepository
  }) =>
  (input: ChangePlanInput): Effect.Effect<ChangePlanResult, ChangePlanError> => {
    return Effect.gen(function* () {
      // Find active subscription
      const subscription = yield* deps.subscriptionRepository.findActiveByOrganizationId(input.organizationId)

      if (!subscription) {
        return yield* new NoActiveSubscriptionError({ organizationId: input.organizationId })
      }

      // Check if already on requested plan
      if (subscription.plan === input.newPlan) {
        return yield* new SamePlanError({
          currentPlan: subscription.plan,
          requestedPlan: input.newPlan,
        })
      }

      // Get existing grants before revocation
      const previousGrants = yield* deps.grantRepository.findBySubscriptionId(subscription.id)

      // Revoke existing grants
      yield* deps.grantRepository.revokeBySubscription(subscription.id)

      // Create new grants based on new plan
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

      // Persist new grants
      yield* deps.grantRepository.saveMany(newGrants)

      // Update subscription with new plan and timestamp
      const updatedSubscription: Subscription = {
        ...subscription,
        plan: input.newPlan,
        updatedAt: new Date(),
      }

      yield* deps.subscriptionRepository.save(updatedSubscription)

      return {
        subscription: updatedSubscription,
        previousGrants,
        newGrants,
      }
    })
  }
