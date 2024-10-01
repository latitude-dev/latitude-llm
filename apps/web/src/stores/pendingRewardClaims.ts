import { useCallback } from 'react'

import { ClaimedRewardWithUserInfo } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { fetchPendingRewardClaimsAction } from '$/actions/rewards/fetchPendingRewardClaimsAction'
import { updateRewardClaimValidityAction } from '$/actions/rewards/updateRewardClaimValidityAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: ClaimedRewardWithUserInfo[] = []

export default function usePendingRewardClaims(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const {
    mutate,
    data = EMPTY_ARRAY,
    isLoading,
    error: swrError,
  } = useSWR<ClaimedRewardWithUserInfo[]>(
    ['pendingRewardClaims'],
    useCallback(async () => {
      const [data, error] = await fetchPendingRewardClaimsAction()

      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })
      }
      if (!data) return EMPTY_ARRAY

      return data
    }, []),
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
