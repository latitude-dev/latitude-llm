import { NextRequest, NextResponse } from 'next/server'
import { handleSubscriptionCreated } from '@latitude-data/core/services/billing/handleSubscriptionCreated'
import { handleSubscriptionUpdatedOrCreated } from '@latitude-data/core/services/billing/handleSubscriptionUpdatedOrCreated'
import { handleSubscriptionCancelled } from '@latitude-data/core/services/billing/handleSubscriptionCancelled'
import { parseWebhookEvent } from '@latitude-data/core/services/billing/parseWebhookEvent'
import { errorHandler } from '$/middlewares/errorHandler'

/**
 * Stripe webhook handler for subscription events.
 *
 * We only process subscriptions with status 'active' because:
 *
 * **subscription.created with non-active status:**
 * - `incomplete`: Initial payment failed or requires authentication (3D Secure).
 *   Stripe will send `subscription.updated` once payment succeeds.
 * - `trialing`: Subscription has a Stripe-managed trial. We handle trials separately
 *   in our own system, not through Stripe trials. The reason are 2 I didnt think about it and thinking
 *   about I think having customers on trial in Stripe add noise to our billing system.
 *
 * **subscription.updated with non-active status:**
 * - `past_due`: Payment failed but subscription not yet canceled. We don't want to
 *   downgrade immediately; Stripe will retry and send another event.
 * - `canceled`: Subscription was canceled. We may want to handle this separately
 *   to downgrade the workspace.
 * - `unpaid`: Multiple payment attempts failed. Similar to past_due.
 *
 * **subscription.updated routing:**
 * When a subscription.updated event arrives with status 'active', we check if
 * the Stripe customer is already linked to a workspace:
 * - **Not linked**: This is a delayed first activation (e.g., after 3D Secure
 *   authentication completed). We treat it as a creation and use metadata.workspaceId.
 * - **Already linked**: This is a plan change (e.g., via Customer Portal).
 *   We update the existing subscription.
 *
 * By only processing 'active' subscriptions, we ensure we only provision access
 * after payment is confirmed.
 */
export const POST = errorHandler(async (req: NextRequest) => {
  const event = await parseWebhookEvent({
    payload: await req.text(),
    signature: req.headers.get('stripe-signature'),
  }).then((r) => r.unwrap())

  if (event.type === 'customer.subscription.created') {
    await handleSubscriptionCreated({
      stripeSubscription: event.data.object,
    }).then((r) => r.unwrap())

    return NextResponse.json(
      { received: true, event_type: event.type },
      { status: 200 },
    )
  }

  if (event.type === 'customer.subscription.updated') {
    await handleSubscriptionUpdatedOrCreated({
      stripeSubscription: event.data.object,
    }).then((r) => r.unwrap())

    return NextResponse.json(
      { received: true, event_type: event.type },
      { status: 200 },
    )
  }

  if (event.type === 'customer.subscription.deleted') {
    await handleSubscriptionCancelled({
      stripeSubscription: event.data.object,
    }).then((r) => r.unwrap())

    return NextResponse.json(
      { received: true, event_type: event.type },
      { status: 200 },
    )
  }

  return new NextResponse(null, { status: 204 })
})
