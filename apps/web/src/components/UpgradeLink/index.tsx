import { MouseEvent, ReactNode, useCallback, useMemo } from 'react'
import { FREE_PLANS, SubscriptionPlan } from '@latitude-data/core/browser'
import { useSession } from '@latitude-data/web-ui/providers'
import { createCustomerPortalAction } from '$/actions/billing/createCustomerPortalAction'
import { Button, ButtonProps } from '@latitude-data/web-ui/atoms/Button'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useFeature from '$/stores/useFeature'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { envClient } from '$/envClient'

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
  const oldTeamV1Link = envClient.NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL
  const { toast } = useToast()
  const { currentUser, workspace } = useSession()
  const latte = useFeature('latte') // feature flag
  const isLoadingFeature = latte.isLoading || latte.isValidating
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

      if (!latte.isEnabled) {
        // Old behaviour: free -> pricing, others -> mailto
        if (isFreePlan) {
          const upgradeLink = `${oldTeamV1Link}?prefilled_email=${currentUser.email}`
          window.open(upgradeLink, '_blank')
        } else {
          window.location.href = 'mailto:hello@latitude.so'
        }
        return
      }

      if (plan === SubscriptionPlan.ProV2) {
        createPortal()
      } else if (TEAM_PLANS.includes(plan)) {
        window.location.href = 'mailto:hello@latitude.so'
      } else {
        window.open(PRICING_PAGE, '_blank')
      }
    },
    [
      createPortal,
      isFreePlan,
      latte.isEnabled,
      plan,
      currentUser.email,
      oldTeamV1Link,
    ],
  )

  const label = useMemo(() => {
    if (isLoadingFeature) return 'Loading...'

    if (!latte.isEnabled) {
      if (isFreePlan) return 'Upgrade to Team plan'
      return 'Contact us to upgrade'
    }

    if (isFreePlan) return 'Choose a plan'
    if (plan === SubscriptionPlan.ProV2) return 'Upgrade to Team plan'
    return 'Contact us to upgrade'
  }, [latte.isEnabled, isLoadingFeature, isFreePlan, plan])

  const disabled = isLoadingFeature || isPending
  return (
    <Button {...buttonProps} onClick={handleClick} disabled={disabled}>
      {children ? children({ label }) : label}
    </Button>
  )
}
