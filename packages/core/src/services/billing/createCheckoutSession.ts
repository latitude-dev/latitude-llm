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
 *
 * TODO: `customer_email` pre-fills the email but users can change it before paying.
 * The Stripe customer email may differ from the Latitude user email. This doesn't
 * break workspace linking (we use metadata.workspaceId), but could cause confusion
 * in billing communications. We could add a JSONB metadata field on the subscription when is
 * created to store the email used at checkout linked to the subscription. Maybe also in the upgrade flow too.
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
