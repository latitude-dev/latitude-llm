import { getProductAccess } from '$/services/productAccess/getProductAccess'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import NewIntegrationSetting from '../../_components/Integrations/New'

export default async function NewIntegration() {
  const productAccess = await getProductAccess()
  if (!productAccess.agentBuilder) {
    redirect(ROUTES.dashboard.root)
  }

  return <NewIntegrationSetting />
}
