import { addDays, isAfter } from 'date-fns'

export enum SubscriptionPlan {
  EnterpriseV1 = 'enterprise_v1',
  HobbyV1 = 'hobby_v1',
  HobbyV2 = 'hobby_v2',
  HobbyV3 = 'hobby_v3',
  TeamV1 = 'team_v1',
  ProV2 = 'pro_v2',
  TeamV2 = 'team_v2',
  TeamV3 = 'team_v3',
  TeamV4 = 'team_v4',
  ScaleV1 = 'scale_v1',
}

const NO_STRIPE_PRICE = 'NO_STRIPE_PRICE'
const ONE_HUNDRED_YEARS_IN_DAYS = 36500
export const DEFAULT_RETENTION_PERIOD_DAYS = 30

export const SubscriptionPlans = {
  [SubscriptionPlan.HobbyV1]: {
    name: 'Hobby',
    credits: 50_000, // runs
    users: 1,
    retention_period: 30, // days
    rate_limit: 10, // per second
    latte_credits: 30,
    optimizationsMonth: 0,
    stripePriceId: NO_STRIPE_PRICE,
  },
  [SubscriptionPlan.TeamV1]: {
    name: 'Team',
    credits: 100_000, // runs
    users: 5,
    retention_period: 90, // days
    rate_limit: 83, // per second
    latte_credits: 300,
    optimizationsMonth: 5,
    stripePriceId: 'price_1QjVaoAMdFMjIC4f7oRcoEzE',
  },
  [SubscriptionPlan.HobbyV2]: {
    name: 'Hobby',
    credits: 10_000, // runs
    users: 1,
    retention_period: 30, // days
    rate_limit: 10, // per second
    latte_credits: 30,
    optimizationsMonth: 0,
    stripePriceId: NO_STRIPE_PRICE,
  },
  [SubscriptionPlan.HobbyV3]: {
    name: 'Hobby',
    credits: 10_000, // runs
    users: 2,
    retention_period: 30, // days
    rate_limit: 10, // per second
    latte_credits: 30,
    optimizationsMonth: 5,
    stripePriceId: NO_STRIPE_PRICE,
  },
  [SubscriptionPlan.ProV2]: {
    name: 'Pro',
    credits: 80_000, // runs
    users: 1,
    retention_period: 30, // days
    rate_limit: 83, // per second
    latte_credits: 100,
    optimizationsMonth: 5,
    stripePriceId: 'price_1S5XYVAMdFMjIC4ff8jaaa7B',
  },
  [SubscriptionPlan.TeamV2]: {
    name: 'Team',
    credits: 200_000, // runs
    users: 5,
    retention_period: 90, // days
    rate_limit: 83, // per second
    latte_credits: 300,
    optimizationsMonth: 5,
    stripePriceId: 'price_1S5XcmAMdFMjIC4fco75QEuP',
  },
  [SubscriptionPlan.TeamV3]: {
    name: 'Team',
    credits: 200_000, // runs
    users: 'unlimited' as const,
    retention_period: 90, // days
    rate_limit: 83, // per second
    latte_credits: 300,
    optimizationsMonth: 5,
    stripePriceId: 'price_1Seuy8AMdFMjIC4fIsnzPTN1',
  },
  [SubscriptionPlan.EnterpriseV1]: {
    name: 'Enterprise',
    credits: 'unlimited' as const, // runs
    users: 'unlimited' as const,
    retention_period: ONE_HUNDRED_YEARS_IN_DAYS,
    rate_limit: 500, // per second
    latte_credits: 'unlimited' as const,
    optimizationsMonth: 'unlimited' as const,
    stripePriceId: NO_STRIPE_PRICE,
  },
  [SubscriptionPlan.TeamV4]: {
    name: 'Team',
    credits: 200_000, // runs
    users: 'unlimited' as const,
    retention_period: 90, // days
    rate_limit: 83, // per second
    latte_credits: 300,
    optimizationsMonth: 5,
    stripePriceId: 'price_1SpqqpAMdFMjIC4fR89sjjS7',
  },
  [SubscriptionPlan.ScaleV1]: {
    name: 'Scale',
    credits: 1_000_000, // runs
    users: 'unlimited' as const,
    retention_period: ONE_HUNDRED_YEARS_IN_DAYS,
    rate_limit: 166, // per second
    latte_credits: 1500, // 5x Team plan
    optimizationsMonth: 'unlimited' as const,
    stripePriceId: NO_STRIPE_PRICE,
  },
}

const PLAN_KEYS = Object.keys(SubscriptionPlans) as SubscriptionPlan[]

export type TrialInfo = {
  daysInTrial: number
  trialEnded: boolean
  trialEndsAt: Date | null
  trialDaysLeft: number
}

export type SubscriptionPlanData =
  (typeof SubscriptionPlans)[keyof typeof SubscriptionPlans] & {
    plan: SubscriptionPlan
  }

export type SubscriptionPlanContent = SubscriptionPlanData & {
  trialInfo: TrialInfo | null
}

export const STRIPE_PLANS = [
  SubscriptionPlan.ProV2,
  SubscriptionPlan.TeamV1,
  SubscriptionPlan.TeamV2,
  SubscriptionPlan.TeamV3,
  SubscriptionPlan.TeamV4,
]

export const FREE_PLANS = [
  SubscriptionPlan.HobbyV1,
  SubscriptionPlan.HobbyV2,
  SubscriptionPlan.HobbyV3,
]
export const PRO_PLANS = [SubscriptionPlan.ProV2]
export const TEAM_PLANS = [
  SubscriptionPlan.TeamV1,
  SubscriptionPlan.TeamV2,
  SubscriptionPlan.TeamV3,
  SubscriptionPlan.TeamV4,
]
export const LEGACY_PLANS = [
  SubscriptionPlan.ProV2,
  SubscriptionPlan.TeamV1,
  SubscriptionPlan.TeamV2,
  SubscriptionPlan.TeamV3,
]

export function getContactSalesLink(): string {
  return 'https://latitude.so/book-demo'
}

export const TRIAL_DAYS = 30

export function getTrialEndDateFromNow(): Date {
  return addDays(new Date(), TRIAL_DAYS)
}

function differenceInCalendarDaysUtc(dateLeft: Date, dateRight: Date): number {
  const leftUtc = Date.UTC(
    dateLeft.getUTCFullYear(),
    dateLeft.getUTCMonth(),
    dateLeft.getUTCDate(),
  )
  const rightUtc = Date.UTC(
    dateRight.getUTCFullYear(),
    dateRight.getUTCMonth(),
    dateRight.getUTCDate(),
  )
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  return Math.floor((leftUtc - rightUtc) / MS_PER_DAY)
}

export function hasPlanLimitedRetention(plan: SubscriptionPlan): boolean {
  return SubscriptionPlans[plan].retention_period < ONE_HUNDRED_YEARS_IN_DAYS
}

export function getPlansWithLimitedRetention(): SubscriptionPlan[] {
  return PLAN_KEYS.filter(hasPlanLimitedRetention)
}

/**
 * Computes trial information for a subscription
 * Returns null if the plan is a paying plan (non-free)
 */
export function computeTrialInfo({
  plan,
  trialEndsAt,
}: {
  plan: SubscriptionPlan
  trialEndsAt: Date | null
}): TrialInfo | null {
  const isFreePlan = FREE_PLANS.includes(plan)

  if (!isFreePlan) return null
  if (!trialEndsAt) return null

  const now = new Date()
  const trialEnded = isAfter(now, trialEndsAt)
  const trialDaysLeft = Math.max(
    0,
    differenceInCalendarDaysUtc(trialEndsAt, now),
  )

  return {
    daysInTrial: TRIAL_DAYS,
    trialEnded,
    trialEndsAt,
    trialDaysLeft,
  }
}

/**
 * Checks if a subscription is paying (non-free plan) or in an active trial
 * Returns true if the user can use paid features
 */
export function isPayingOrTrialing({
  plan,
  trialEndsAt,
}: {
  plan: SubscriptionPlan
  trialEndsAt: Date | null
}): boolean {
  const isFreePlan = FREE_PLANS.includes(plan)

  if (!isFreePlan) return true

  const trialInfo = computeTrialInfo({ plan, trialEndsAt })
  if (!trialInfo) return true

  return !trialInfo.trialEnded
}
