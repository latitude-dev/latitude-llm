import useSWR from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { completeOnboardingAction } from '$/actions/workspaceOnboarding/complete'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { moveNextOnboardingStepAction } from '$/actions/workspaceOnboarding/moveNextStep'
import { WorkspaceOnboarding } from '@latitude-data/core/schema/types'
import { createPromptEngineeringResourcesAction } from '$/actions/workspaceOnboarding/createPromptEngineeringResources'

export default function useWorkspaceOnboarding() {
  const fetcher = useFetcher<WorkspaceOnboarding>(
    ROUTES.api.workspaces.onboarding.root,
  )

  const { data, error, mutate, isLoading } = useSWR<WorkspaceOnboarding, Error>(
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

  const { execute: executeCreatePromptEngineeringResources } =
    useLatitudeAction(createPromptEngineeringResourcesAction)

  const {
    execute: moveNextOnboardingStep,
    isPending: isPendingNextOnboardingStep,
  } = useLatitudeAction(moveNextOnboardingStepAction, {
    onSuccess: ({ data: updatedOnboarding }) => {
      if (!updatedOnboarding) {
        return
      }

      mutate(updatedOnboarding, { revalidate: false })
    },
  })

  return {
    onboarding: data,
    error,
    isLoading,
    moveNextOnboardingStep,
    executeCreatePromptEngineeringResources,
    isPendingNextOnboardingStep,
    executeCompleteOnboarding,
    refetch: () => mutate(),
  }
}
