import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { type User } from '../../schema/models/types/User'
import { getStripe } from '../../lib/stripe'
import { Workspace } from '../../schema/models/types/Workspace'
import { users } from '../../schema/models/users'
import { database } from '../../client'

/**
 * If the user clicking upgrade button has a Stripe customer
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

async function getWorkspaceCreatorEmail(
  workspace: Workspace,
): Promise<string | null> {
  if (!workspace.creatorId) return null

  const result = await database
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, workspace.creatorId))
    .limit(1)

  if (result.length === 0) return null

  return result[0]!.email
}

/**
 * FIXME: This is super wrong. We should not be looking for customers
 * based on emails like this. We need to have a proper relation between
 * users and customers in our DB.
 *
 * We should link Stripe customer to the workspace
 */
async function findStripeCustomer({
  currentUser,
  workspace,
  stripe,
}: {
  currentUser: User
  workspace: Workspace
  stripe: Stripe
}): Promise<Stripe.Customer | undefined> {
  const customer = await getStripeCustomer({ email: currentUser.email }, stripe)
  if (customer) return customer

  const creatorEmail = await getWorkspaceCreatorEmail(workspace)

  if (!creatorEmail || creatorEmail === currentUser.email) return undefined

  return getStripeCustomer({ email: creatorEmail }, stripe)
}

/**
 * Creates a Stripe customer portal session for subscription management
 */
export async function createCustomerPortalSession({
  workspace,
  currentUser,
}: {
  workspace: Workspace
  currentUser: User
}): Promise<string | undefined> {
  const stripe = getStripe().unwrap()

  const customer = await findStripeCustomer({ currentUser, workspace, stripe })
  if (!customer) return undefined

  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: 'https://app.latitude.so',
  })

  return session.url
}
