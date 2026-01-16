import Stripe from 'stripe'
import { env } from '@latitude-data/env'
import { Result, TypedResult } from '../../lib/Result'
import { BillingError } from '@latitude-data/constants/errors'
import { getStripe } from '../../lib/stripe'

/**
 * Parses and validates a Stripe webhook event from a request.
 *
 * Handles:
 * - Stripe SDK initialization
 * - Webhook secret validation
 * - Signature verification
 * - Event construction
 */
export async function parseWebhookEvent({
  payload,
  signature,
}: {
  payload: string
  signature: string | null
}): Promise<TypedResult<Stripe.Event>> {
  const stripeResult = getStripe()
  if (stripeResult.error) {
    return Result.error(stripeResult.error)
  }
  const stripe = stripeResult.value

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return Result.error(
      new BillingError(
        'Stripe webhook secret is not configured. Please set STRIPE_WEBHOOK_SECRET.',
      ),
    )
  }

  if (!signature) {
    return Result.error(new BillingError('Missing Stripe signature header'))
  }

  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    )
    return Result.ok(event)
  } catch (err) {
    return Result.error(
      new BillingError('Failed to verify Stripe webhook signature', {
        originalError: err as Error,
      }),
    )
  }
}
