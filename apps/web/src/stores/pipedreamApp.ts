import { ROUTES } from '$/services/routes'
import useSWR from 'swr'
import useFetcher from '../hooks/useFetcher'
import { AppDto } from '@latitude-data/core/browser'
import { useMemo } from 'react'

type AppResponse =
  | { data: AppDto; ok: true }
  | { errorMessage: string; ok: false }

export function usePipedreamApp(slugName: string) {
  const fetcher = useFetcher<AppDto, AppResponse>(
    ROUTES.api.integrations.pipedream.detail(slugName).root,
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
