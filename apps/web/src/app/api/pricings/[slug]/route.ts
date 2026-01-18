import { ROUTES } from '$/services/routes'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import {
  FREE_PLANS,
  getContactSalesLink,
  LEGACY_PLANS,
  SubscriptionPlan,
} from '@latitude-data/core/plans'
import { createCheckoutSession } from '@latitude-data/core/services/billing/createCheckoutSession'
import { createCustomerPortalSession } from '@latitude-data/core/services/billing/createCustomerPortalSession'
import { User } from '@latitude-data/core/schema/models/types/User'
import { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'
import { env } from '@latitude-data/env'

const CONTACT_SALES_PLANS = [
  SubscriptionPlan.ScaleV1,
  SubscriptionPlan.EnterpriseV1,
]

function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return Object.values(SubscriptionPlan).includes(value as SubscriptionPlan)
}

/**
 * Handles plan selection and subscription management.
 *
 * - Free (hobby) users selecting Team V4 → Creates Stripe Checkout Session
 * - Existing paying customers (legacy plans) → Redirects to Customer Portal
 * - Scale/Enterprise plans → Redirects to book a demo (not self-serve)
 */
export const GET = errorHandler(
  authHandler(
    async (
      _req: NextRequest,
      {
        params,
        user,
        workspace,
      }: {
        params: { slug: string }
        user: User
        workspace: WorkspaceDto
      },
    ) => {
      const { slug } = params
      if (!isSubscriptionPlan(slug)) {
        return NextResponse.json(
          { message: 'Invalid pricing plan' },
          { status: 400 },
        )
      }

      const currentPlan = workspace.currentSubscription.plan

      if (CONTACT_SALES_PLANS.includes(slug)) {
        return NextResponse.redirect(getContactSalesLink())
      }

      const returnUrl = `${env.APP_URL}${ROUTES.choosePricingPlan.root}`
      const isFreePlan = currentPlan && FREE_PLANS.includes(currentPlan)
      const isLegacyPaidPlan = currentPlan && LEGACY_PLANS.includes(currentPlan)

      if (isFreePlan && slug === SubscriptionPlan.TeamV4) {
        const returnUrl = `${env.APP_URL}${ROUTES.choosePricingPlan.root}`
        const { url } = await createCheckoutSession({
          // FIXME: Put TeamV4 constant before merging
          plan: SubscriptionPlan.TeamV4,
          /* plan: SubscriptionPlan.TeamV3, */
          workspaceId: workspace.id,
          userEmail: user.email,
          successUrl: `${returnUrl}?checkout=success`,
          cancelUrl: `${returnUrl}?checkout=canceled`,
        }).then((r) => r.unwrap())

        return NextResponse.redirect(url)
      }

      if (isLegacyPaidPlan && workspace.stripeCustomerId) {
        const portalSession = await createCustomerPortalSession({
          stripeCustomerId: workspace.stripeCustomerId,
          returnUrl: `${returnUrl}?checkout=customer_portal`,
          workspaceId: workspace.id,
          userEmail: user.email,
        }).then((r) => r.unwrap())

        return NextResponse.redirect(portalSession.url)
      }

      return NextResponse.json(
        {
          message:
            'This plan is not available for your current subscription. Please contact our support team and we will be happy to assist you.',
        },
        { status: 400 },
      )
    },
  ),
)
