import {
  defineError,
  defineErrorDynamic,
  type GrantId,
  type OrganizationId,
  type RepositoryError,
  type SubscriptionId,
} from "@domain/shared"
import { Effect } from "effect"
import { createGrant, type GrantType } from "../entities/grant.ts"
import { getAvailablePlans, type Plan } from "../entities/plan.ts"
import { createSubscription } from "../entities/subscription.ts"
import { GrantRepository } from "../ports/grant-repository.ts"
import { SubscriptionRepository } from "../ports/subscription-repository.ts"

export interface SubscribeInput {
  readonly subscriptionId: SubscriptionId
  readonly organizationId: OrganizationId
  readonly plan: Plan
  readonly trialDays?: number
  readonly grantIds: {
    seats: GrantId
    runs: GrantId
    credits: GrantId
  }
}

export class SubscriptionAlreadyExistsError extends defineError(
  "SubscriptionAlreadyExistsError",
  409,
  "Organization already has an active subscription",
)<{
  readonly organizationId: OrganizationId
}> {}

export class InvalidPlanError extends defineErrorDynamic("InvalidPlanError", 400, (f: { reason: string }) => f.reason)<{
  readonly plan: Plan
  readonly reason: string
}> {}

export type SubscribeError = RepositoryError | SubscriptionAlreadyExistsError | InvalidPlanError

/**
 * Subscribe to a plan for an organization.
 *
 * This use case:
 * 1. Validates the plan
 * 2. Checks for existing active subscription
 * 3. Creates the subscription entity
 * 4. Issues grants based on plan configuration
 * 5. Persists subscription and grants
 * 6. Returns the created subscription
 */
export const subscribe = (input: SubscribeInput) =>
  Effect.gen(function* () {
    const subscriptionRepository = yield* SubscriptionRepository
    const grantRepository = yield* GrantRepository

    const validPlans = getAvailablePlans()
    if (!validPlans.includes(input.plan)) {
      return yield* new InvalidPlanError({ plan: input.plan, reason: "Unknown plan" })
    }

    const existing = yield* subscriptionRepository.exists()
    if (existing) {
      return yield* new SubscriptionAlreadyExistsError({ organizationId: input.organizationId })
    }

    const trialEndsAt = input.trialDays ? new Date(Date.now() + input.trialDays * 24 * 60 * 60 * 1000) : null

    const subscription = createSubscription({
      id: input.subscriptionId,
      organizationId: input.organizationId,
      plan: input.plan,
      trialEndsAt,
    })

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

    const grants = grantConfigs.map((config) =>
      createGrant({
        id: grantIdByType[config.type],
        organizationId: input.organizationId,
        subscriptionId: input.subscriptionId,
        type: config.type,
        amount: config.amount,
      }),
    )

    yield* subscriptionRepository.save(subscription)

    yield* grantRepository.saveMany(grants)

    return subscription
  })
