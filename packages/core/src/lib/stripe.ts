import Stripe from 'stripe'
import { env } from '@latitude-data/env'
import { Result, TypedResult } from './Result'
import {
  BillingError,
  BillingErrorTags,
  UnprocessableEntityError,
} from '@latitude-data/constants/errors'

let stripeInstance: Stripe | null = null

export function getStripe({
  tags,
}: { tags?: BillingErrorTags } = {}): TypedResult<Stripe> {
  if (stripeInstance) return Result.ok(stripeInstance)

  const secret = env.STRIPE_SECRET_KEY

  if (!secret) {
    const originalError = new UnprocessableEntityError(
      'Stripe SDK not initialized. Server configuration error.',
    )
    return Result.error(
      new BillingError(
        'Unable to process payment at this time. Please try again later or contact support.',
        { tags, originalError },
      ),
    )
  }

  stripeInstance = new Stripe(secret, {
    typescript: true,
  })

  return Result.ok(stripeInstance)
}
