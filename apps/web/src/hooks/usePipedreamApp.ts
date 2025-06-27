import { ROUTES } from '$/services/routes'
import useSWR from 'swr'
import useFetcher from './useFetcher'
import type { App, V1Component as Component } from '@pipedream/sdk/browser'
import { AppDto } from '@latitude-data/core/browser'

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

  const { data = undefined, isLoading } = useSWR<
    App & { components: Component[] }
  >(['pipedreamApp', slugName], fetcher)

  return { data, isLoading }
}
