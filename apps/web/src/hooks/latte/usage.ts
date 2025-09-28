'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { LatteUsage } from '@latitude-data/core/constants'

export function useLatteUsage(opts?: SWRConfiguration) {
  const route = ROUTES.api.latte.usage.root
  const fetcher = useFetcher<LatteUsage>(route, { fallback: null })

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<LatteUsage>(compact(route), fetcher, opts)

  return useMemo(() => ({ data, mutate, ...rest }), [data, mutate, rest])
}
