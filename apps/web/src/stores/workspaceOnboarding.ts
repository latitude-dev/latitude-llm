import useSWR from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { completeOnboardingAction } from '$/actions/workspaceOnboarding/complete'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { WorkspaceOnboarding } from '@latitude-data/core/schema/models/types/WorkspaceOnboarding'

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

  return {
    onboarding: data,
    error,
    isLoading,
    executeCompleteOnboarding,
    refetch: () => mutate(),
  }
}
