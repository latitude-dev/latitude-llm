import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { computeProductAccess } from '@latitude-data/core/services/productAccess/computeProductAccess'

export async function getProductAccess() {
  const { workspace } = await getCurrentUserOrRedirect()
  return computeProductAccess(workspace)
}
