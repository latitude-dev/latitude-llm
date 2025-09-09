import { noop } from 'lodash-es'
import { useCallback } from 'react'

import { claimRewardAction } from '$/actions/rewards/claimRewardAction'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { ClaimedReward } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: ClaimedReward[] = []

export default function useRewards(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const fetcher = useFetcher<ClaimedReward[]>(ROUTES.api.claimedRewards.root)
  const {
    mutate,
    data = EMPTY_ARRAY,
    isLoading,
    error: swrError,
  } = useSWR<ClaimedReward[]>(['workspaceClaimedRewards'], fetcher, opts)

  const updateRewards = useCallback(
    (newReward: ClaimedReward) => {
      mutate(
        (prevRewards) => {
          if (!prevRewards) return [newReward]
          return [...prevRewards, newReward]
        },
        { revalidate: false },
      )
    },
    [mutate],
  )

  const { execute: executeClaimRewardAction } = useLatitudeAction(
    claimRewardAction,
    { onSuccess: noop }, // noop to prevent useLatitudeAction's default toast
  )

  const claimReward = useCallback(
    async ({
      type,
      reference,
    }: {
      type: string
      reference: string
      optimistic?: boolean
    }) => {
      return executeClaimRewardAction({ type, reference }).then(
        ([claimedReward]) => {
          if (!claimedReward) return

          toast({
            title: 'Success',
            description: 'Your reward has been claimed successfully',
          })

          updateRewards(claimedReward)
        },
      )
    },
    [executeClaimRewardAction, toast, updateRewards],
  )

  return { data, isLoading, error: swrError, claimReward }
}
