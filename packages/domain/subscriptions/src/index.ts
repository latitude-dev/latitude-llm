// Entity exports

export {
  consume,
  createGrant,
  type Grant,
  type GrantType,
  hasBalance,
  isValid,
  revoke,
} from "./entities/grant.ts"
export {
  getAvailablePlans,
  getPlanConfig,
  hasFeature,
  PLAN_CONFIGS,
  type Plan,
  type PlanConfig,
} from "./entities/plan.ts"
export {
  createSubscription,
  isActive,
  isCancelled,
  isInTrial,
  type Subscription,
} from "./entities/subscription.ts"
export {
  createGrantIssuedEvent,
  type GrantIssuedEvent,
} from "./events/grant-issued.ts"
// Event exports
export {
  createSubscriptionCreatedEvent,
  type SubscriptionCreatedEvent,
} from "./events/subscription-created.ts"
export { GrantRepository } from "./ports/grant-repository.ts"
// Port exports
export { SubscriptionRepository } from "./ports/subscription-repository.ts"
export {
  type ChangePlanError,
  type ChangePlanInput,
  type ChangePlanResult,
  changePlan,
  NoActiveSubscriptionError,
  PlanDowngradeError,
  SamePlanError,
} from "./use-cases/change-plan.ts"
export {
  type GetOrganizationQuotaError,
  getOrganizationQuota,
  type OrganizationQuota,
  type QuotaInfo,
} from "./use-cases/get-organization-quota.ts"
// Use case exports
export {
  InvalidPlanError,
  type SubscribeError,
  type SubscribeInput,
  SubscriptionAlreadyExistsError,
  subscribe,
} from "./use-cases/subscribe.ts"
