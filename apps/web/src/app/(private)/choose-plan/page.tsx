import { redirect } from 'next/navigation'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { PlanSelection } from './_components/PlanSelection'
import { buildPlanOptions } from './_lib/buildPlanOptions'

export default async function PlanSelectionPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; okco?: string }>
}) {
  const { checkout, okco } = await searchParams

  if (checkout) {
    const sameUrl = ROUTES.choosePricingPlan.root

    redirect(checkout === 'success' ? `${sameUrl}?okco=1` : sameUrl)
  }

  const { subscriptionPlan } = await getCurrentUserOrRedirect()
  const planOptions = buildPlanOptions({ currentPlan: subscriptionPlan.plan })

  return (
    <div className='flex justify-center items-start w-full min-h-full py-12'>
      <PlanSelection planOptions={planOptions} renderConfetti={!!okco} />
    </div>
  )
}
