import { envClient } from '$/envClient'
import { FREE_PLANS } from '@latitude-data/core/browser'
import { useSession } from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import type { ReactNode } from 'react'

export function UpgradeLink({ children }: { children: ReactNode }) {
  const { currentUser, workspace } = useSession()
  const upgradeLink = `${envClient.NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL}?prefilled_email=${currentUser.email}`
  const isFreePlan = FREE_PLANS.includes(workspace.currentSubscription.plan)
  const href = isFreePlan ? upgradeLink : 'mailto:hello@latitude.so'

  return (
    <Link href={href} target='_blank'>
      {children}
    </Link>
  )
}
