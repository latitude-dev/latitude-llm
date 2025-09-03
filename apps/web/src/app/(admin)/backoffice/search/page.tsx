import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { notFound } from 'next/navigation'

import { InfoSearchDashboard } from './_components/InfoSearchDashboard'

export default async function InfoPage() {
  const { user } = await getCurrentUserOrRedirect()
  if (!user?.admin) {
    return notFound()
  }

  return <InfoSearchDashboard />
}
