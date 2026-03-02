// Entity exports
export {
  createSubscription,
  isActive,
  isCancelled,
  isInTrial,
  type Subscription,
} from "./entities/subscription.ts";

export {
  createGrant,
  hasBalance,
  isValid,
  revoke,
  consume,
  type Grant,
  type GrantType,
} from "./entities/grant.ts";

export {
  getPlanConfig,
  getAvailablePlans,
  hasFeature,
  PLAN_CONFIGS,
  type Plan,
  type PlanConfig,
} from "./entities/plan.ts";

// Port exports
export type { SubscriptionRepository } from "./ports/subscription-repository.ts";
export type { GrantRepository } from "./ports/grant-repository.ts";

// Use case exports
export {
  subscribe,
  type SubscribeInput,
  type SubscribeError,
  SubscriptionAlreadyExistsError,
  InvalidPlanError,
} from "./use-cases/subscribe.ts";

export {
  changePlan,
  type ChangePlanInput,
  type ChangePlanResult,
  type ChangePlanError,
  NoActiveSubscriptionError,
  SamePlanError,
  PlanDowngradeError,
} from "./use-cases/change-plan.ts";

export {
  getOrganizationQuota,
  type OrganizationQuota,
  type QuotaInfo,
  type GetOrganizationQuotaError,
} from "./use-cases/get-organization-quota.ts";

// Event exports
export {
  createSubscriptionCreatedEvent,
  type SubscriptionCreatedEvent,
} from "./events/subscription-created.ts";

export {
  createGrantIssuedEvent,
  type GrantIssuedEvent,
} from "./events/grant-issued.ts";
