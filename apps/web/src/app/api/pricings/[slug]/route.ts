import { ROUTES } from '$/services/routes'
import { getDataFromSession } from '$/data-access'
import { NextRequest, NextResponse } from 'next/server'
import { SubscriptionPlan } from '@latitude-data/core/browser'

function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return Object.values(SubscriptionPlan).includes(value as SubscriptionPlan)
}

const PLAN_PRO_PAYMENT_URL = 'https://buy.stripe.com/28EcN4bfq0YodDM17r38407'
const PLAN_TEAM_PAYMENT_URL = 'https://buy.stripe.com/4gMbJ083e4aAfLU4jD38406'

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

  const paymentUrlMap: Partial<Record<SubscriptionPlan, string>> = {
    [SubscriptionPlan.ProV2]: PLAN_PRO_PAYMENT_URL,
    [SubscriptionPlan.TeamV2]: PLAN_TEAM_PAYMENT_URL,
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
