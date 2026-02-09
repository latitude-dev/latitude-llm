'use client'

import { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { updateSubscriptionTrialEndsAtAction } from '$/actions/admin/subscriptions/updateTrialEndsAt'
import { ChangeTrialEndDateModal } from '../ChangeTrialEndDateModal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useRouter } from 'next/navigation'

type Props = {
  workspaceId: number
  currentTrialEndsAt: Date | null
}

export function ChangeTrialEndDateButton({
  workspaceId,
  currentTrialEndsAt,
}: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const { execute, isPending } = useLatitudeAction(
    updateSubscriptionTrialEndsAtAction,
    {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Trial end date updated successfully',
        })
        setIsModalOpen(false)
        router.refresh()
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error?.message || 'Failed to update trial end date',
          variant: 'destructive',
        })
      },
    },
  )

  const handleConfirm = async (trialEndsAt: Date | null) => {
    await execute({
      workspaceId,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
    })
  }

  return (
    <>
      <Button
        variant='outline'
        size='small'
        onClick={() => setIsModalOpen(true)}
        disabled={isPending}
      >
        Edit Trial
      </Button>
      <ChangeTrialEndDateModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        currentTrialEndsAt={currentTrialEndsAt}
        onConfirm={handleConfirm}
        isLoading={isPending}
      />
    </>
  )
}
