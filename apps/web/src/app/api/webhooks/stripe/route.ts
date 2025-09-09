import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  BadRequestError,
  UnprocessableEntityError,
} from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { handleSubscriptionUpdate } from '@latitude-data/core/services/billing/handleSubscriptionUpdate'
import { errorHandler } from '$/middlewares/errorHandler'
import { getStripe } from '@latitude-data/core/lib/stripe'

function getWebhookSecret() {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new UnprocessableEntityError(
      'Stripe webhook secret is not configured. Please set STRIPE_WEBHOOK_SECRET.',
    )
  }

  return env.STRIPE_WEBHOOK_SECRET
}

async function getEvent({
  stripe,
  request,
}: {
  stripe: Stripe
  request: NextRequest
}) {
  const webhookSecret = getWebhookSecret()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    throw new BadRequestError('Missing Stripe signature header')
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      sig,
      webhookSecret,
    )
  } catch (err) {
    const error = err as Error
    throw new UnprocessableEntityError(`Webhook Error: ${error.message}`)
  }

  return event
}

export const POST = errorHandler(async (req: NextRequest) => {
  const stripe = getStripe().unwrap()
  const event = await getEvent({ stripe, request: req })

  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.created'
  ) {
    const subscription = event.data.object as Stripe.Subscription

    if (subscription.status === 'active') {
      await handleSubscriptionUpdate({
        stripeSubscription: subscription,
        stripe,
      }).then((r) => r.unwrap())
    }

    return NextResponse.json(
      {
        received: true,
        event_type: event.type,
      },
      { status: 200 },
    )
  }

  return new NextResponse(null, {
    status: 204,
  })
})
