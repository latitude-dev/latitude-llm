'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useBillingPortal } from '$/hooks/useBillingPortal'

export function CustomerPortalButton() {
  const billingPortal = useBillingPortal()

  if (!billingPortal.hasBillingPortal) return null

  return (
    <Button
      fancy
      variant='default'
      onClick={billingPortal.onClick}
      disabled={billingPortal.isLoading}
    >
      {billingPortal.isLoading ? 'Loading...' : 'Billing information'}{' '}
    </Button>
  )
}
