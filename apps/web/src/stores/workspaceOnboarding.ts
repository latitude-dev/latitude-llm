import { useCallback } from 'react'
import useSWR from 'swr'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { completeOnboardingAction } from '$/actions/workspaceOnboarding/complete'
import { useLatitudeAction } from 'zsa-react'
import { nextOnboardingStepAction } from '$/actions/workspaceOnboarding/nextOnboardingStep'

export type OnboardingStatus = {
  id?: number
  workspaceId?: number
  completedAt?: Date | null
}

export default function useWorkspaceOnboarding() {
  const { toast } = useToast()
  const fetcher = useFetcher<OnboardingStatus>(
    ROUTES.api.workspaces.onboarding.root,
  )

  const { data, error, mutate, isLoading } = useSWR<OnboardingStatus, Error>(
    'api/workspaces/onboarding',
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
    },
  )

  const { execute: executeCompleteOnboarding } = useLatitudeAction(
    completeOnboardingAction,
  )

  const { execute: executeUpdateStep, isPending: isUpdatingStep } =
    useLatitudeAction(nextOnboardingStepAction)

  const updateStep = useCallback(
    async (step: number) => {
      try {
        const response = await fetch(ROUTES.api.workspaces.onboarding.update, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ step }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to update onboarding step')
        }

        const updatedOnboarding = await response.json()
        mutate(updatedOnboarding)
        return updatedOnboarding
      } catch (error) {
        toast({
          title: 'Failed to update onboarding step',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        })
        throw error
      }
    },
    [mutate, toast],
  )

  return {
    onboarding: data,
    error,
    isLoading,
    updateStep,
    executeCompleteOnboarding,
    refetch: () => mutate(),
  }
}
