import type { DomainEvent } from "@domain/events";
import type { OrganizationId, SubscriptionId } from "@domain/shared-kernel";
import type { Plan } from "../entities/plan.js";

/**
 * SubscriptionCreated event - emitted when a new subscription is created.
 */
export interface SubscriptionCreatedEvent
  extends DomainEvent<
    "SubscriptionCreated",
    {
      subscriptionId: SubscriptionId;
      organizationId: OrganizationId;
      plan: Plan;
      trialEndsAt: string | null;
    }
  > {
  readonly name: "SubscriptionCreated";
}

export const createSubscriptionCreatedEvent = (params: {
  subscriptionId: SubscriptionId;
  organizationId: OrganizationId;
  plan: Plan;
  trialEndsAt: Date | null;
}): SubscriptionCreatedEvent => ({
  name: "SubscriptionCreated",
  workspaceId: params.organizationId,
  payload: {
    subscriptionId: params.subscriptionId,
    organizationId: params.organizationId,
    plan: params.plan,
    trialEndsAt: params.trialEndsAt ? params.trialEndsAt.toISOString() : null,
  },
});
