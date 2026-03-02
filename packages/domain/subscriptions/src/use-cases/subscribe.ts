import type { OrganizationId, RepositoryError, SubscriptionId } from "@domain/shared-kernel";
import type { GrantId } from "@domain/shared-kernel";
import { Data, Effect } from "effect";
import { createGrant } from "../entities/grant.ts";
import type { GrantType } from "../entities/grant.ts";
import type { Plan } from "../entities/plan.ts";
import { type Subscription, createSubscription } from "../entities/subscription.ts";
import type { GrantRepository } from "../ports/grant-repository.ts";
import type { SubscriptionRepository } from "../ports/subscription-repository.ts";

/**
 * Input for subscribing to a plan.
 */
export interface SubscribeInput {
  readonly subscriptionId: SubscriptionId;
  readonly organizationId: OrganizationId;
  readonly plan: Plan;
  readonly trialDays?: number;
  readonly grantIds: {
    seats: GrantId;
    runs: GrantId;
    credits: GrantId;
  };
}

/**
 * Error types for subscribe use case.
 */
export class SubscriptionAlreadyExistsError extends Data.TaggedError(
  "SubscriptionAlreadyExistsError",
)<{
  readonly organizationId: OrganizationId;
}> {}

export class InvalidPlanError extends Data.TaggedError("InvalidPlanError")<{
  readonly plan: Plan;
  readonly reason: string;
}> {}

export type SubscribeError = RepositoryError | SubscriptionAlreadyExistsError | InvalidPlanError;

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
export const subscribe =
  (deps: {
    subscriptionRepository: SubscriptionRepository;
    grantRepository: GrantRepository;
  }) =>
  (input: SubscribeInput): Effect.Effect<Subscription, SubscribeError> => {
    return Effect.gen(function* () {
      // Validate plan
      const validPlans = ["HobbyV3", "TeamV4", "EnterpriseV1", "ScaleV1"] as Plan[];
      if (!validPlans.includes(input.plan)) {
        return yield* new InvalidPlanError({ plan: input.plan, reason: "Unknown plan" });
      }

      // Check for existing subscription
      const existing = yield* deps.subscriptionRepository.existsForOrganization(
        input.organizationId,
      );
      if (existing) {
        return yield* new SubscriptionAlreadyExistsError({ organizationId: input.organizationId });
      }

      // Create subscription with optional trial
      const trialEndsAt = input.trialDays
        ? new Date(Date.now() + input.trialDays * 24 * 60 * 60 * 1000)
        : null;

      const subscription = createSubscription({
        id: input.subscriptionId,
        organizationId: input.organizationId,
        plan: input.plan,
        trialEndsAt,
      });

      // Create grants based on plan (would normally look up plan config)
      const grantConfigs: Array<{ type: GrantType; amount: number }> = [
        { type: "seats", amount: 10 },
        { type: "runs", amount: 1000 },
        { type: "credits", amount: 500 },
      ];

      const grantIdByType: Record<GrantType, GrantId> = {
        seats: input.grantIds.seats,
        runs: input.grantIds.runs,
        credits: input.grantIds.credits,
      };

      const grants = grantConfigs.map((config) =>
        createGrant({
          id: grantIdByType[config.type],
          organizationId: input.organizationId,
          subscriptionId: input.subscriptionId,
          type: config.type,
          amount: config.amount,
        }),
      );

      // Persist subscription
      yield* deps.subscriptionRepository.save(subscription);

      // Persist grants
      yield* deps.grantRepository.saveMany(grants);

      return subscription;
    });
  };
