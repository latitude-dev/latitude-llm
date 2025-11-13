'use client'

import { FormEvent, useState, useEffect } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { SubscriptionPlan, SubscriptionPlans } from '@latitude-data/core/plans'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlan: SubscriptionPlan
  onConfirm: (plan: SubscriptionPlan) => Promise<void>
  isLoading: boolean
}

const planOptions = Object.values(SubscriptionPlan).map((plan) => ({
  value: plan,
  label: `${SubscriptionPlans[plan].name} (${plan})`,
}))

export function ChangePlanModal({
  open,
  onOpenChange,
  currentPlan,
  onConfirm,
  isLoading,
}: Props) {
  const [selectedPlan, setSelectedPlan] =
    useState<SubscriptionPlan>(currentPlan)

  // Reset selected plan when modal opens or current plan changes
  useEffect(() => {
    if (open) {
      setSelectedPlan(currentPlan)
    }
  }, [open, currentPlan])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedPlan || selectedPlan === currentPlan) return

    await onConfirm(selectedPlan)
  }

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      title='Change Subscription Plan'
      description='Select a new subscription plan for this workspace. A new subscription will be created and the workspace will be updated.'
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            form='changePlanForm'
            type='submit'
            disabled={isLoading || selectedPlan === currentPlan}
            isLoading={isLoading}
          >
            Change Plan
          </Button>
        </>
      }
    >
      <form id='changePlanForm' onSubmit={handleSubmit}>
        <FormWrapper>
          <Select
            label='Subscription Plan'
            name='plan'
            options={planOptions}
            value={selectedPlan}
            onChange={(value) => setSelectedPlan(value as SubscriptionPlan)}
            required
            description={`Current plan: ${SubscriptionPlans[currentPlan].name} (${currentPlan})`}
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
