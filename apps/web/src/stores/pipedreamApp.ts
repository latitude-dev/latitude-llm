'use client'

import { ROUTES } from '$/services/routes'
import useSWR from 'swr'
import useFetcher from '../hooks/useFetcher'
import { useMemo } from 'react'
import { AppDto } from '@latitude-data/core/constants'

type AppResponse =
  | { data: AppDto; ok: true }
  | { errorMessage: string; ok: false }

export function usePipedreamApp(slugName: string | undefined) {
  const fetcher = useFetcher<AppDto, AppResponse>(
    slugName
      ? ROUTES.api.integrations.pipedream.detail(slugName).root
      : undefined,
    {
      serializer: (response) => {
        if (!response.ok) {
          throw new Error(response.errorMessage)
        }

        return response.data
      },
    },
  )

  const { data = undefined, isLoading } = useSWR<AppDto>(
    ['pipedreamApp', slugName],
    fetcher,
  )

  return useMemo(() => ({ data, isLoading }), [data, isLoading])
}
