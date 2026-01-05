import { ROUTES } from '$/services/routes'
import { getDataFromSession } from '$/data-access'
import { NextRequest, NextResponse } from 'next/server'
import { SubscriptionPlan } from '@latitude-data/core/plans'

function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return Object.values(SubscriptionPlan).includes(value as SubscriptionPlan)
}

const PLAN_TEAM_PAYMENT_URL = 'https://buy.stripe.com/9B6bJ0dnyePe57g7vP38408'

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
    [SubscriptionPlan.TeamV3]: PLAN_TEAM_PAYMENT_URL,
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
