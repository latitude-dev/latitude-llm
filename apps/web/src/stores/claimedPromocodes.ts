'use client'

import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { claimPromocodeAction } from '$/actions/promocodes/claim'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useSWR from 'swr'
import { Promocode } from '@latitude-data/core/browser'

const EMPTY_ARRAY: Promocode[] = []

export default function useClaimedPromocodes() {
  const { toast } = useToast()
  const fetcher = useFetcher<Promocode[]>(ROUTES.api.claimedPromocodes.root)

  const {
    data = EMPTY_ARRAY,
    mutate,
    isLoading,
  } = useSWR<Promocode[]>('claimedPromocodes', fetcher)

  const { execute: executeClaim, isPending } = useLatitudeAction(
    claimPromocodeAction,
    {
      onSuccess: ({ data: claimedPromocode }) => {
        toast({ title: 'Promocode claimed!', variant: 'default' })
        mutate([claimedPromocode, ...data])
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })
      },
    },
  )

  return { data, claim: executeClaim, isLoading, isClaiming: isPending }
}
