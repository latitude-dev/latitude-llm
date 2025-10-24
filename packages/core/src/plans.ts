export enum SubscriptionPlan {
  EnterpriseV1 = 'enterprise_v1',
  HobbyV1 = 'hobby_v1',
  HobbyV2 = 'hobby_v2',
  HobbyV3 = 'hobby_v3',
  TeamV1 = 'team_v1',
  ProV2 = 'pro_v2',
  TeamV2 = 'team_v2',
  TeamV3 = 'team_v3',
}

const NO_STRIPE_PRICE = 'NO_STRIPE_PRICE'

export const SubscriptionPlans = {
  [SubscriptionPlan.HobbyV1]: {
    name: 'Hobby',
    credits: 50_000, // runs
    users: 1,
    retention_period: 30, // days
    rate_limit: 10, // per second
    latte_credits: 30,
    stripePriceId: NO_STRIPE_PRICE,
  },
  [SubscriptionPlan.TeamV1]: {
    name: 'Team',
    credits: 100_000, // runs
    users: 5,
    retention_period: 1825, // days
    rate_limit: 166, // per second
    latte_credits: 300,
    stripePriceId: 'price_1QjVaoAMdFMjIC4f7oRcoEzE',
  },
  [SubscriptionPlan.HobbyV2]: {
    name: 'Hobby',
    credits: 10_000, // runs
    users: 1,
    retention_period: 30, // days
    rate_limit: 10, // per second
    latte_credits: 30,
    stripePriceId: NO_STRIPE_PRICE,
  },
  [SubscriptionPlan.HobbyV3]: {
    name: 'Hobby',
    credits: 10_000, // runs
    users: 2,
    retention_period: 30, // days
    rate_limit: 10, // per second
    latte_credits: 30,
    stripePriceId: NO_STRIPE_PRICE,
  },
  [SubscriptionPlan.ProV2]: {
    name: 'Pro',
    credits: 80_000, // runs
    users: 1,
    retention_period: 30, // days
    rate_limit: 83, // per second
    latte_credits: 100,
    stripePriceId: 'price_1S5XYVAMdFMjIC4ff8jaaa7B',
  },
  [SubscriptionPlan.TeamV2]: {
    name: 'Team',
    credits: 200_000, // runs
    users: 5,
    retention_period: 1825, // days
    rate_limit: 166, // per second
    latte_credits: 300,
    stripePriceId: 'price_1S5XcmAMdFMjIC4fco75QEuP',
  },
  [SubscriptionPlan.TeamV3]: {
    name: 'Team',
    credits: 200_000, // runs
    users: 'unlimited' as const,
    retention_period: 1825, // days
    rate_limit: 166, // per second
    latte_credits: 300,
    stripePriceId: 'price_1S5XcmAMdFMjIC4fco75QEuP',
  },
  [SubscriptionPlan.EnterpriseV1]: {
    name: 'Enterprise',
    credits: 'unlimited' as const, // runs
    users: 'unlimited' as const,
    retention_period: 3650, // days
    rate_limit: 500, // per second
    latte_credits: 'unlimited' as const,
    stripePriceId: NO_STRIPE_PRICE,
  },
}

export type SubscriptionPlanContent =
  (typeof SubscriptionPlans)[keyof typeof SubscriptionPlans] & {
    plan: SubscriptionPlan
  }

export const STRIPE_PLANS = [
  SubscriptionPlan.ProV2,
  SubscriptionPlan.TeamV1,
  SubscriptionPlan.TeamV2, // TODO: Do we still need this?
  SubscriptionPlan.TeamV3,
]

export const FREE_PLANS = [
  SubscriptionPlan.HobbyV1,
  SubscriptionPlan.HobbyV2,
  SubscriptionPlan.HobbyV3,
]
export const PRO_PLANS = [SubscriptionPlan.ProV2]
