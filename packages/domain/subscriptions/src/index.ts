// Entity exports
export {
  createSubscription,
  isActive,
  isCancelled,
  isInTrial,
  type Subscription,
} from "./entities/subscription.js";

export {
  createGrant,
  hasBalance,
  isValid,
  revoke,
  consume,
  type Grant,
  type GrantType,
} from "./entities/grant.js";

export {
  getPlanConfig,
  getAvailablePlans,
  hasFeature,
  PLAN_CONFIGS,
  type Plan,
  type PlanConfig,
} from "./entities/plan.js";

// Port exports
export type { SubscriptionRepository } from "./ports/subscription-repository.js";
export type { GrantRepository } from "./ports/grant-repository.js";

// Use case exports
export {
  subscribe,
  type SubscribeInput,
  type SubscribeError,
  SubscriptionAlreadyExistsError,
  InvalidPlanError,
} from "./use-cases/subscribe.js";

export {
  changePlan,
  type ChangePlanInput,
  type ChangePlanResult,
  type ChangePlanError,
  NoActiveSubscriptionError,
  SamePlanError,
  PlanDowngradeError,
} from "./use-cases/change-plan.js";

export {
  getOrganizationQuota,
  type OrganizationQuota,
  type QuotaInfo,
  type GetOrganizationQuotaError,
} from "./use-cases/get-organization-quota.js";

// Event exports
export {
  createSubscriptionCreatedEvent,
  type SubscriptionCreatedEvent,
} from "./events/subscription-created.js";

export {
  createGrantIssuedEvent,
  type GrantIssuedEvent,
} from "./events/grant-issued.js";
