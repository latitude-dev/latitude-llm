import { createCustomerPortalAction } from '$/actions/billing/createCustomerPortalAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { Button, ButtonProps } from '@latitude-data/web-ui/atoms/Button'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useSession } from '../Providers/SessionProvider'
import { MouseEvent, ReactNode, useCallback, useMemo } from 'react'
import { FREE_PLANS, SubscriptionPlan } from '@latitude-data/core/plans'

const PRICING_PAGE = 'https://latitude.so/pricing' // Hardcoded for now.
const TEAM_PLANS = [SubscriptionPlan.TeamV1, SubscriptionPlan.TeamV2]

const UPDATE_ERROR_MESSAGE =
  'There was an error generating the payment link. Make sure your user in Latitude is the one that bought the subscription. Please contact support: hello@latitude.so'

export function UpgradeLink({
  buttonProps,
  children,
}: {
  buttonProps: Exclude<ButtonProps, 'children'>
  children?: (_args: { label: string }) => ReactNode
}) {
  const { toast } = useToast()
  const { workspace } = useSession()
  const plan = workspace.currentSubscription.plan
  const isFreePlan = FREE_PLANS.includes(plan)

  const { execute: createPortal, isPending } = useLatitudeAction(
    createCustomerPortalAction,
    {
      onSuccess: ({ data }) => {
        const url = data.url
        if (!url) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: UPDATE_ERROR_MESSAGE,
          })
          return
        }

        // Open the portal in a new tab
        window.open(url, '_blank')
      },
      onError: () => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: UPDATE_ERROR_MESSAGE,
        })
      },
    },
  )

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault()

      if (plan === SubscriptionPlan.ProV2) {
        createPortal()
      } else if (TEAM_PLANS.includes(plan)) {
        window.location.href = 'mailto:hello@latitude.so'
      } else {
        window.open(PRICING_PAGE, '_blank')
      }
    },
    [createPortal, plan],
  )

  const label = useMemo(() => {
    if (isFreePlan) return 'Choose a plan'
    if (plan === SubscriptionPlan.ProV2) return 'Upgrade to Team plan'
    return 'Contact us to upgrade'
  }, [isFreePlan, plan])

  return (
    <Button {...buttonProps} onClick={handleClick} disabled={isPending}>
      {children ? children({ label }) : label}
    </Button>
  )
}
