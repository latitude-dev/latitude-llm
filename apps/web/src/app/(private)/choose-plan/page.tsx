import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { PlanSelection } from './_components/PlanSelection'
import { buildPlanOptions } from './_lib/buildPlanOptions'

export default async function PlanSelectionPage() {
  const { subscriptionPlan } = await getCurrentUserOrRedirect()
  const planOptions = buildPlanOptions({ currentPlan: subscriptionPlan.plan })

  return (
    <div className='flex justify-center items-start w-full min-h-full py-12'>
      <PlanSelection planOptions={planOptions} />
    </div>
  )
}
