'use client'

import { ROUTES } from '$/services/routes'
import useSWR from 'swr'
import useFetcher from '../hooks/useFetcher'
import { useMemo } from 'react'
import { AppDto, LightAppDto } from '@latitude-data/core/constants'

type MaybeAppDto<C extends boolean> = C extends true
  ? AppDto
  : C extends false
    ? LightAppDto
    : never
type AppResponse<C extends boolean> =
  | { data: MaybeAppDto<C>; ok: true }
  | { errorMessage: string; ok: false }

export function usePipedreamApp<C extends boolean>(
  slugName: string | undefined,
  options: { withConfig: C },
) {
  const { withConfig } = options
  const url = slugName
    ? `${ROUTES.api.integrations.pipedream.detail(slugName).root}?withConfig=${withConfig}`
    : undefined

  const fetcher = useFetcher<MaybeAppDto<C>, AppResponse<C>>(url, {
    serializer: (response) => {
      if (!response.ok) {
        throw new Error(response.errorMessage)
      }

      return response.data
    },
    fallback: null,
  })

  const { data = undefined, isLoading } = useSWR<MaybeAppDto<C>>(
    ['pipedreamApp', slugName, withConfig],
    fetcher,
  )

  return useMemo(() => ({ data, isLoading }), [data, isLoading])
}
