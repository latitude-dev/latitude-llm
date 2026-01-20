import { BillingError } from '@latitude-data/constants/errors'
import { Result, TypedResult } from '../../lib/Result'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import { getStripe } from '../../lib/stripe'

export type CreateCheckoutSessionParams = {
  plan: SubscriptionPlan
  workspaceId: number
  userEmail: string
  successUrl: string
  cancelUrl: string
}

/**
 * Creates a Stripe Checkout Session for subscription purchases.
 *
 * Uses `subscription_data.metadata.workspaceId` to ensure the workspace
 * can be identified in subscription webhooks regardless of event ordering.
 */
export async function createCheckoutSession({
  plan,
  workspaceId,
  userEmail,
  successUrl,
  cancelUrl,
}: CreateCheckoutSessionParams): Promise<TypedResult<{ url: string }>> {
  const tags = { workspaceId, userEmail, plan }

  const stripeResult = getStripe({ tags })
  if (stripeResult.error) return stripeResult

  const stripe = stripeResult.value
  const priceId = SubscriptionPlans[plan].stripePriceId

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          workspaceId: String(workspaceId),
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    if (!session.url) {
      return Result.error(
        new BillingError(
          'Checkout session created but no redirect URL was returned.',
          { tags },
        ),
      )
    }

    return Result.ok({ url: session.url })
  } catch (error) {
    return Result.error(
      new BillingError(
        `Failed to create checkout session: ${(error as Error).message}`,
        {
          tags,
          originalError: error as Error,
        },
      ),
    )
  }
}
