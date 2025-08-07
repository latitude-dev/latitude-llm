import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  BadRequestError,
  UnprocessableEntityError,
} from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { handleSubscriptionUpdate } from '@latitude-data/core/services/billing/handleSubscriptionUpdate'
import { errorHandler } from '$/middlewares/errorHandler'

export const POST = errorHandler(async (req: NextRequest) => {
  const stripeSecretKey = env.STRIPE_SECRET_KEY
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET
  if (!stripeSecretKey) {
    throw new UnprocessableEntityError(
      'Stripe SDK not initialized. Server configuration error.',
    )
  }

  const stripe = stripeSecretKey
    ? new Stripe(stripeSecretKey, {
        typescript: true,
      })
    : undefined

  if (!stripe) {
    throw new UnprocessableEntityError(
      'Stripe SDK not initialized. Server configuration error.',
    )
  }

  if (!webhookSecret) {
    throw new UnprocessableEntityError(
      'Stripe webhook secret is not configured. Please set STRIPE_WEBHOOK_SECRET.',
    )
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    throw new BadRequestError('Missing Stripe signature header')
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, webhookSecret)
  } catch (error: any) {
    throw new UnprocessableEntityError(`Webhook Error: ${error.message}`)
  }

  if (event.type === 'customer.subscription.updated') {
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
