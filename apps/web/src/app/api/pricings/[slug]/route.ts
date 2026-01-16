import { ROUTES } from '$/services/routes'
import { getDataFromSession } from '$/data-access'
import { NextRequest, NextResponse } from 'next/server'
import {
  getContactSalesLink,
  SubscriptionPlan,
} from '@latitude-data/core/plans'

function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return Object.values(SubscriptionPlan).includes(value as SubscriptionPlan)
}

const PLAN_TEAM_PAYMENT_URL = 'https://buy.stripe.com/dRm6oGgzK8qQ2Z82bv38409'

/**
 * IMPORTANT:
 * This API is used by public page
 * https://latitude.so/pricing
 * We get the plan slug from the URL and redirect the user to the appropriate payment link.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  if (!isSubscriptionPlan(slug)) {
    return NextResponse.json(
      { message: 'Invalid pricing plan' },
      { status: 400 },
    )
  }

  const { user } = await getDataFromSession()
  if (!user) {
    const loginUrl = new URL(ROUTES.auth.login, request.url)
    loginUrl.searchParams.set('returnTo', request.url)
    return NextResponse.redirect(loginUrl)
  }
  const bookADemo = getContactSalesLink()
  const paymentUrlMap: Partial<Record<SubscriptionPlan, string>> = {
    [SubscriptionPlan.TeamV4]: PLAN_TEAM_PAYMENT_URL,
    [SubscriptionPlan.ScaleV1]: bookADemo,
    [SubscriptionPlan.EnterpriseV1]: bookADemo,
  }
  const paymentUrl = paymentUrlMap[slug]
  if (!paymentUrl) {
    return NextResponse.json(
      { message: 'Invalid pricing plan' },
      { status: 400 },
    )
  }

  const upgradeLink = `${paymentUrl}?prefilled_email=${encodeURIComponent(user.email)}`

  return NextResponse.redirect(upgradeLink)
}
