'use server'

import { createCustomerPortalSession } from '@latitude-data/core/services/billing/createCustomerPortalSession'
import { authProcedure } from '$/actions/procedures'
import { env } from '@latitude-data/env'
import { ROUTES } from '$/services/routes'

/**
 * Creates a Stripe customer portal session for subscription management
 */
export const createCustomerPortalAction = authProcedure.action(
  async ({ ctx }) => {
    const stripeCustomerId = ctx.workspace.stripeCustomerId

    if (!stripeCustomerId) {
      throw new Error('Workspace does not have a Stripe customer ID')
    }

    const session = await createCustomerPortalSession({
      stripeCustomerId,
      workspaceId: ctx.workspace.id,
      userEmail: ctx.user.email,
      returnUrl: `${env.APP_URL}${ROUTES.settings.root}`,
    }).then((r) => r.unwrap())

    return { url: session.url }
  },
)
