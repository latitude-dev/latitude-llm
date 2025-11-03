import useSWR from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { completeOnboardingAction } from '$/actions/workspaceOnboarding/complete'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { moveNextOnboardingStepAction } from '$/actions/workspaceOnboarding/moveNextStep'
import { WorkspaceOnboarding } from '@latitude-data/core/schema/models/types/WorkspaceOnboarding'

import { createPromptEngineeringResourcesAction } from '$/actions/workspaceOnboarding/createPromptEngineeringResources'
import { createDefaultAgentOnboardingProjectAction } from '$/actions/workspaceOnboarding/createDefaultAgentOnboardingProject'

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
    {
      onSuccess: () => {
        // No-op
      },
    },
  )

  const { execute: executeCreatePromptEngineeringResources } =
    useLatitudeAction(createPromptEngineeringResourcesAction, {
      onSuccess: () => {
        // No-op
      },
    })

  const { execute: createDefaultAgentOnboardingProject } = useLatitudeAction(
    createDefaultAgentOnboardingProjectAction,
    {
      onSuccess: () => {
        // No-op
      },
    },
  )

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
    createDefaultAgentOnboardingProject,
    isPendingNextOnboardingStep,
    executeCompleteOnboarding,
    refetch: () => mutate(),
  }
}
