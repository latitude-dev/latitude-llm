import Stripe from 'stripe'
import { BillingError } from '@latitude-data/constants/errors'
import { Result, TypedResult } from '../../lib/Result'
import { getStripe } from '../../lib/stripe'

/**
 * Creates a Stripe Customer Portal session for managing subscriptions.
 *
 * Allows existing customers to:
 * - Upgrade their plan
 * - Update payment method
 * - View invoices
 */
export async function createCustomerPortalSession({
  stripeCustomerId,
  returnUrl,
  workspaceId,
  userEmail,
}: {
  stripeCustomerId: string
  returnUrl: string
  workspaceId?: number
  userEmail?: string
}): Promise<TypedResult<Stripe.BillingPortal.Session>> {
  const tags = { stripeCustomerId, workspaceId, userEmail }

  const stripeResult = getStripe({ tags })
  if (stripeResult.error) return stripeResult

  const stripe = stripeResult.value

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    })

    return Result.ok(session)
  } catch (error) {
    return Result.error(
      new BillingError(
        `Failed to create customer portal session: ${(error as Error).message}`,
        {
          tags,
          originalError: error as Error,
        },
      ),
    )
  }
}
