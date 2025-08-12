import { ClaimedRewardWithUserInfo } from '@latitude-data/core/browser'
import { updateRewardClaimValidityAction } from '$/actions/rewards/updateRewardClaimValidityAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'

const EMPTY_ARRAY: ClaimedRewardWithUserInfo[] = []

export function usePendingRewardClaims(opts?: SWRConfiguration) {
  const fetcher = useFetcher<ClaimedRewardWithUserInfo[]>(
    ROUTES.api.admin.rewards.pending.root,
  )
  const {
    mutate,
    data = EMPTY_ARRAY,
    isLoading,
    error: swrError,
  } = useSWR<ClaimedRewardWithUserInfo[]>(
    ['pendingRewardClaims'],
    fetcher,
    opts,
  )

  const { execute: updateRewardClaim } = useLatitudeAction(
    updateRewardClaimValidityAction,
    {
      onSuccess: ({ data: claimedReward }) => {
        mutate((prev) => prev?.filter((r) => r.id !== claimedReward?.id))
      },
    },
  )

  return { data, isLoading, error: swrError, updateRewardClaim }
}
