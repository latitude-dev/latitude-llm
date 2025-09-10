import Stripe from 'stripe'
import { env } from '@latitude-data/env'
import { Result, TypedResult } from './Result'
import { UnprocessableEntityError } from '@latitude-data/constants/errors'

let stripeInstance: Stripe | null = null

export function getStripe(): TypedResult<Stripe> {
  if (stripeInstance) return Result.ok(stripeInstance)

  const secret = env.STRIPE_SECRET_KEY

  if (!secret) {
    return Result.error(
      new UnprocessableEntityError(
        'Stripe SDK not initialized. Server configuration error.',
      ),
    )
  }

  stripeInstance = new Stripe(secret, {
    typescript: true,
  })

  return Result.ok(stripeInstance)
}
