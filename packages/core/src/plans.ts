export enum SubscriptionPlan {
  EnterpriseV1 = 'enterprise_v1',
  HobbyV1 = 'hobby_v1',
  HobbyV2 = 'hobby_v2',
  TeamV1 = 'team_v1',
}

export const SubscriptionPlans = {
  [SubscriptionPlan.HobbyV2]: {
    name: 'Hobby',
    credits: 10_000,
    users: 1,
    retention_period: 30, // days
    rate_limit: 10, // per second
    latte_credits: 30,
  },
  [SubscriptionPlan.HobbyV1]: {
    name: 'Hobby',
    credits: 50_000,
    users: 1,
    retention_period: 30, // days
    rate_limit: 10, // per second
    latte_credits: 30,
  },
  [SubscriptionPlan.TeamV1]: {
    name: 'Team',
    credits: 100_000,
    users: 5,
    retention_period: 1825, // days
    rate_limit: 166, // per second
    latte_credits: 300,
  },
  [SubscriptionPlan.EnterpriseV1]: {
    name: 'Enterprise',
    credits: 1_000_000,
    users: 1000,
    retention_period: 3650, // days
    rate_limit: 500, // per second
    latte_credits: 'unlimited' as const,
  },
}

export type SubscriptionPlanContent =
  (typeof SubscriptionPlans)[keyof typeof SubscriptionPlans] & {
    plan: SubscriptionPlan
  }

export const FREE_PLANS = [SubscriptionPlan.HobbyV1, SubscriptionPlan.HobbyV2]
