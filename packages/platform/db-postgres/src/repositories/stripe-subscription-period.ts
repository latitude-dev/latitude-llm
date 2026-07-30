import type Stripe from "stripe"

type StripeSubscriptionPeriod = {
  readonly periodStart: Date
  readonly periodEnd: Date
}

export const pickLicensedSubscriptionPeriod = (
  items: readonly Stripe.SubscriptionItem[],
): StripeSubscriptionPeriod | null => {
  const licensed = items.find((item) => item.price.recurring?.usage_type !== "metered") ?? items[0]
  if (licensed === undefined || licensed.current_period_start == null || licensed.current_period_end == null) {
    return null
  }

  return {
    periodStart: new Date(licensed.current_period_start * 1000),
    periodEnd: new Date(licensed.current_period_end * 1000),
  }
}

export const isSubscriptionPeriodStale = (periodEnd: Date | null, now: Date): boolean =>
  periodEnd !== null && periodEnd.getTime() <= now.getTime()
