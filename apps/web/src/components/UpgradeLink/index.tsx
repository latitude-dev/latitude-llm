import { ReactNode, useMemo } from 'react'
import Link from 'next/link'
import { Button, ButtonProps } from '@latitude-data/web-ui/atoms/Button'
import { useSession } from '../Providers/SessionProvider'
import { SubscriptionPlan } from '@latitude-data/core/plans'
import { ROUTES } from '$/services/routes'

export function UpgradeLink({
  buttonProps,
  children,
}: {
  buttonProps: Exclude<ButtonProps, 'children'>
  children?: (_args: { label: string }) => ReactNode
}) {
  const { workspace } = useSession()
  const plan = workspace.currentSubscription.plan
  const label = useMemo(() => {
    if (plan === SubscriptionPlan.ProV2) return 'Upgrade to Team plan'
    return 'Choose a plan'
  }, [plan])

  return (
    <Link href={ROUTES.choosePricingPlan.root}>
      <Button {...buttonProps}>{children ? children({ label }) : label}</Button>
    </Link>
  )
}
