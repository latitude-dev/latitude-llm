'use server'

import { createCustomerPortalSession } from '@latitude-data/core/services/billing/stripeCustomer'
import { authProcedure } from '$/actions/procedures'

/**
 * Creates a Stripe customer portal session for subscription management
 */
export const createCustomerPortalAction = authProcedure.action(
  async ({ ctx }) => {
    const url = await createCustomerPortalSession({
      workspace: ctx.workspace,
      currentUser: ctx.user,
    })

    if (!url) throw new Error('No customer portal URL returned')

    return { url }
  },
)
