import Stripe from 'stripe'
import { User } from '../../browser'
import { getStripe } from '../../lib/stripe'

/**
 * If the user clicking upgrade button has a Stripe custome
 * get the ID to generate customer portal
 */
export async function getStripeCustomer(
  {
    email,
  }: {
    email: string
  },
  stripe: Stripe,
): Promise<Stripe.Customer | undefined> {
  const customers = await stripe.customers.search({
    query: `email:'${email}'`,
  })

  if (customers.data.length === 0) return undefined

  return customers.data[0]
}

/**
 * Creates a Stripe customer portal session for subscription management
 */
export async function createCustomerPortalSession({
  currentUser,
}: {
  currentUser: User
}): Promise<string | undefined> {
  const stripe = getStripe().unwrap()
  const customer = await getStripeCustomer({ email: currentUser.email }, stripe)

  if (!customer) return undefined

  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: 'https://app.latitude.so',
  })

  return session.url
}
