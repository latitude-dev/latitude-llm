import { useCallback } from 'react'
import { noop } from 'lodash-es'

import { ClaimedReward } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { claimRewardAction } from '$/actions/rewards/claimRewardAction'
import { fetchClaimedRewardsAction } from '$/actions/rewards/fetchClaimedRewardsAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useSWR, { SWRConfiguration } from 'swr'

import useWorkspaceUsage from './workspaceUsage'

const EMPTY_ARRAY: ClaimedReward[] = []

export default function useRewards(opts?: SWRConfiguration) {
  const { mutate: mutateUsage } = useWorkspaceUsage()

  const { toast } = useToast()
  const {
    mutate,
    data = EMPTY_ARRAY,
    isLoading,
    error: swrError,
  } = useSWR<ClaimedReward[]>(
    ['workspaceClaimedRewards'],
    useCallback(async () => {
      const [data, error] = await fetchClaimedRewardsAction()
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

  const increaseMaxUsage = useCallback(
    (increaseCount: number) => {
      mutateUsage(
        (prevUsage) => {
          if (!prevUsage) return prevUsage
          return {
            ...prevUsage,
            max: prevUsage.max + increaseCount,
          }
        },
        { revalidate: false },
      )
    },
    [mutateUsage],
  )

  const { execute: executeClaimRewardAction } = useLatitudeAction(
    claimRewardAction,
    { onSuccess: noop }, // noop to prevent useLatitudeAction's default toast
  )

  const claimReward = useCallback(
    ({
      type,
      reference,
      optimistic,
    }: {
      type: string
      reference: string
      optimistic?: boolean
    }) => {
      return executeClaimRewardAction({ type, reference }).then(
        ([claimedReward]) => {
          if (!claimedReward) return

          if (optimistic) {
            updateRewards(claimedReward)
            increaseMaxUsage(claimedReward.value)
          }
        },
      )
    },
    [claimRewardAction],
  )

  return { data, isLoading, error: swrError, claimReward }
}
