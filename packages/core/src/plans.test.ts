import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  computeTrialInfo,
  isPayingOrTrialing,
  SubscriptionPlan,
  SubscriptionPlans,
  STRIPE_PLANS,
  TRIAL_DAYS,
} from './plans'

describe('computeTrialInfo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for non-free plans', () => {
    const result = computeTrialInfo({
      plan: SubscriptionPlan.TeamV4,
      trialEndsAt: new Date(),
    })
    expect(result).toBeNull()
  })

  it('returns null if trialEndsAt is null', () => {
    const result = computeTrialInfo({
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt: null,
    })
    expect(result).toBeNull()
  })

  it('returns trial info with days left when trial is active', () => {
    const now = new Date('2026-01-16T12:00:00Z')
    vi.setSystemTime(now)

    const trialEndsAt = new Date('2026-01-26T12:00:00Z')

    const result = computeTrialInfo({
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt,
    })

    expect(result).toEqual({
      daysInTrial: TRIAL_DAYS,
      trialEnded: false,
      trialEndsAt,
      trialDaysLeft: 10,
    })
  })

  it('returns 0 days left when trial has ended', () => {
    const now = new Date('2026-01-16T12:00:00Z')
    vi.setSystemTime(now)

    const trialEndsAt = new Date('2026-01-10T12:00:00Z')

    const result = computeTrialInfo({
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt,
    })

    expect(result).toEqual({
      daysInTrial: TRIAL_DAYS,
      trialEnded: true,
      trialEndsAt,
      trialDaysLeft: 0,
    })
  })

  it('returns 0 days left when less than 24 hours remain', () => {
    const now = new Date('2026-01-16T12:00:00Z')
    vi.setSystemTime(now)

    const trialEndsAt = new Date('2026-01-17T06:00:00Z')

    const result = computeTrialInfo({
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt,
    })

    expect(result).toEqual({
      daysInTrial: TRIAL_DAYS,
      trialEnded: false,
      trialEndsAt,
      trialDaysLeft: 0,
    })
  })

  it('returns trialEnded true when now equals trialEndsAt', () => {
    const now = new Date('2026-01-16T12:00:00Z')
    vi.setSystemTime(now)

    const trialEndsAt = new Date('2026-01-16T12:00:00Z')

    const result = computeTrialInfo({
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt,
    })

    expect(result).toEqual({
      daysInTrial: TRIAL_DAYS,
      trialEnded: false,
      trialEndsAt,
      trialDaysLeft: 0,
    })
  })

  it.each([
    SubscriptionPlan.HobbyV1,
    SubscriptionPlan.HobbyV2,
    SubscriptionPlan.HobbyV3,
  ])('works with free plan %s', (plan) => {
    const now = new Date('2026-01-16T12:00:00Z')
    vi.setSystemTime(now)

    const trialEndsAt = new Date('2026-01-20T12:00:00Z')

    const result = computeTrialInfo({ plan, trialEndsAt })
    expect(result).not.toBeNull()
    expect(result!.trialDaysLeft).toBe(4)
  })
})

describe('isPayingOrTrialing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    SubscriptionPlan.TeamV1,
    SubscriptionPlan.TeamV2,
    SubscriptionPlan.TeamV3,
    SubscriptionPlan.TeamV4,
    SubscriptionPlan.ProV2,
    SubscriptionPlan.ScaleV1,
    SubscriptionPlan.EnterpriseV1,
  ])('returns true for paying plan %s', (plan) => {
    const result = isPayingOrTrialing({ plan, trialEndsAt: null })
    expect(result).toBe(true)
  })

  it('returns true for free plan with active trial', () => {
    const now = new Date('2026-01-16T12:00:00Z')
    vi.setSystemTime(now)

    const trialEndsAt = new Date('2026-01-26T12:00:00Z')

    const result = isPayingOrTrialing({
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt,
    })
    expect(result).toBe(true)
  })

  it('returns false for free plan with ended trial', () => {
    const now = new Date('2026-01-16T12:00:00Z')
    vi.setSystemTime(now)

    const trialEndsAt = new Date('2026-01-10T12:00:00Z')

    const result = isPayingOrTrialing({
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt,
    })
    expect(result).toBe(false)
  })

  it('returns true for free plan with null trialEndsAt', () => {
    const result = isPayingOrTrialing({
      plan: SubscriptionPlan.HobbyV3,
      trialEndsAt: null,
    })
    expect(result).toBe(true)
  })

  it.each([
    SubscriptionPlan.HobbyV1,
    SubscriptionPlan.HobbyV2,
    SubscriptionPlan.HobbyV3,
  ])('returns false for free plan %s with ended trial', (plan) => {
    const now = new Date('2026-01-16T12:00:00Z')
    vi.setSystemTime(now)

    const trialEndsAt = new Date('2026-01-10T12:00:00Z')

    const result = isPayingOrTrialing({ plan, trialEndsAt })
    expect(result).toBe(false)
  })
})

describe('Plan consistency', () => {
  it('all plans with a Stripe price ID are in STRIPE_PLANS', () => {
    const allPlans = Object.values(SubscriptionPlan)

    for (const plan of allPlans) {
      const config = SubscriptionPlans[plan]
      const hasStripePriceId = config.stripePriceId.startsWith('price_')

      if (hasStripePriceId) {
        expect(
          STRIPE_PLANS,
          `Plan ${plan} has stripePriceId but is not in STRIPE_PLANS`,
        ).toContain(plan)
      }
    }
  })

  it('all plans in STRIPE_PLANS have a valid Stripe price ID', () => {
    for (const plan of STRIPE_PLANS) {
      const config = SubscriptionPlans[plan]
      expect(
        config.stripePriceId.startsWith('price_'),
        `Plan ${plan} is in STRIPE_PLANS but has no valid stripePriceId`,
      ).toBe(true)
    }
  })

  it('all plans in SubscriptionPlan enum have a definition in SubscriptionPlans', () => {
    const allPlans = Object.values(SubscriptionPlan)

    for (const plan of allPlans) {
      expect(
        SubscriptionPlans[plan],
        `Plan ${plan} has no definition in SubscriptionPlans`,
      ).toBeDefined()
    }
  })
})
