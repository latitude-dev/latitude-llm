'use server'

import { createCustomerPortalSession } from '@latitude-data/core/services/billing/stripeCustomer'
import { authProcedure } from '$/actions/procedures'

/**
 * Creates a Stripe customer portal session for subscription management
 */
export const createCustomerPortalAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    const url = await createCustomerPortalSession({
      currentUser: ctx.user,
    })

    if (!url) throw new Error('No customer portal URL returned')

    return { url }
  })
