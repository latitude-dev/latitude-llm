'use client'

import { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { changeWorkspacePlanAction } from '$/actions/admin/workspaces/changePlan'
import { SubscriptionPlan } from '@latitude-data/core/plans'
import { ChangePlanModal } from '../ChangePlanModal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useRouter } from 'next/navigation'

type Props = {
  workspaceId: number
  currentPlan: SubscriptionPlan
}

export function ChangePlanButton({ workspaceId, currentPlan }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const { execute, isPending } = useLatitudeAction(changeWorkspacePlanAction, {
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Subscription plan changed successfully',
      })
      setIsModalOpen(false)
      router.refresh()
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to change subscription plan',
        variant: 'destructive',
      })
    },
  })

  const handleConfirm = async (plan: SubscriptionPlan) => {
    await execute({ workspaceId, plan })
  }

  return (
    <>
      <Button
        fancy
        onClick={() => setIsModalOpen(true)}
        variant='outline'
        disabled={isPending}
      >
        Change Plan
      </Button>
      <ChangePlanModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        currentPlan={currentPlan}
        onConfirm={handleConfirm}
        isLoading={isPending}
      />
    </>
  )
}
