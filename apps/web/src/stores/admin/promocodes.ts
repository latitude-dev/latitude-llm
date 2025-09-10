import { Promocode } from '@latitude-data/core/browser'
import useSWR from 'swr'
import { ROUTES } from '$/services/routes'
import { useMemo } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { compact } from 'lodash-es'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { toast } from '@latitude-data/web-ui/atoms/Toast'
import { deletePromocodeAction } from '$/actions/admin/promocodes/deletePromocode'
import { createPromocodeAction } from '$/actions/admin/promocodes/createPromocode'
import { expirePromocodeAction } from '$/actions/admin/promocodes/expirePromocode'

export function usePromocodes(
  setIsCreatePromocodeModalOpen: (open: boolean) => void,
) {
  const route = ROUTES.api.admin.promocodes.root
  const fetcher = useFetcher<Promocode[]>(route)

  const {
    data = [],
    error,
    isLoading,
    mutate,
  } = useSWR<Promocode[]>(compact(route), fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  const { execute: executeCreatePromocode, isPending: isCreatingPromocode } =
    useLatitudeAction(createPromocodeAction, {
      onSuccess: async ({ data: promocode }) => {
        mutate([promocode, ...data])
        setIsCreatePromocodeModalOpen(false)
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.err.message,
          variant: 'destructive',
        })
      },
    })

  const { execute: executeDeletePromocode, isPending: isDeletingPromocode } =
    useLatitudeAction(deletePromocodeAction, {
      onSuccess: ({ data: promocode }) => {
        mutate(data.filter((p) => p.id !== promocode.id))
        toast({
          title: 'Success',
          description: 'Promocode deleted successfully',
        })
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.err.message,
          variant: 'destructive',
        })
      },
    })

  const { execute: executeExpirePromocode, isPending: isExpiringPromocode } =
    useLatitudeAction(expirePromocodeAction, {
      onSuccess: ({ data: expiredPromocode }) => {
        mutate(
          data.map((p) =>
            p.id === expiredPromocode.id ? expiredPromocode : p,
          ),
        )
        toast({
          title: 'Success',
          description: 'Promocode expired successfully',
        })
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.err.message,
          variant: 'destructive',
        })
      },
    })

  return useMemo(
    () => ({
      data,
      error,
      isLoading,
      mutate,
      executeCreatePromocode,
      isCreatingPromocode,
      executeDeletePromocode,
      isDeletingPromocode,
      executeExpirePromocode,
      isExpiringPromocode,
    }),
    [
      data,
      error,
      isLoading,
      mutate,
      executeCreatePromocode,
      isCreatingPromocode,
      executeDeletePromocode,
      isDeletingPromocode,
      executeExpirePromocode,
      isExpiringPromocode,
    ],
  )
}
