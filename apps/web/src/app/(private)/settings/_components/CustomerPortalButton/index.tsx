'use client'

import { useCallback } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { createCustomerPortalAction } from '$/actions/billing/createCustomerPortalAction'
import { useSession } from '$/components/Providers/SessionProvider'
import { FREE_PLANS } from '@latitude-data/core/plans'

const ERROR_MESSAGE = 'Failed to open billing portal. Please try again.'

export function CustomerPortalButton() {
  const { toast } = useToast()
  const { subscriptionPlan } = useSession()
  const isFreePlan = FREE_PLANS.includes(subscriptionPlan.plan)

  const { execute: createPortal, isPending } = useLatitudeAction(
    createCustomerPortalAction,
    {
      onSuccess: ({ data }) => {
        const url = data?.url
        if (!url) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: ERROR_MESSAGE,
          })
          return
        }
        window.open(url, '_blank')
      },
      onError: () => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: ERROR_MESSAGE,
        })
      },
    },
  )

  const handleClick = useCallback(() => {
    createPortal()
  }, [createPortal])

  if (isFreePlan) return null

  return (
    <Button fancy variant='default' onClick={handleClick} disabled={isPending}>
      {isPending ? 'Loading...' : 'Billing information'}
    </Button>
  )
}
