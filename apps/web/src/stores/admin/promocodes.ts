import { Promocode } from '@latitude-data/core/browser'
import { QuotaType } from '@latitude-data/constants'
import useSWR from 'swr'
import { ROUTES } from '$/services/routes'
import { useMemo } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { compact } from 'lodash-es'
import useLatitudeAction from '$/hooks/useLatitudeAction'

import { toast } from '@latitude-data/web-ui/atoms/Toast'
import { deletePromocodeAction } from '$/actions/admin/promocodes/deletePromocode'
import { createPromocodeAction } from '$/actions/admin/promocodes/createPromocode'

type PromocodeWithTypedQuota = Omit<Promocode, 'quotaType'> & {
  quotaType: QuotaType
}

export function usePromocodes(
  setIsCreatePromocodeModalOpen: (open: boolean) => void,
) {
  const route = ROUTES.api.admin.promocodes.root
  const fetcher = useFetcher<PromocodeWithTypedQuota[]>(route)

  const {
    data = [],
    error,
    isLoading,
    mutate,
  } = useSWR<PromocodeWithTypedQuota[]>(compact(route), fetcher, {
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
    ],
  )
}
