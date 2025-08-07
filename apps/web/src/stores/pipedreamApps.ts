import { App } from '@pipedream/sdk/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useSWR, { SWRConfiguration } from 'swr'
import { useMemo } from 'react'
import { ROUTES } from '$/services/routes'

export default function usePipedreamApps(
  { query, cursor }: { query?: string; cursor?: string } = {},
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<App[]>(
    ['pipedream-apps', query, cursor],
    async () => {
      const params = new URLSearchParams()
      if (query) params.append('query', query)
      if (cursor) params.append('cursor', cursor)

      const response = await fetch(
        `${ROUTES.api.integrations.pipedream.apps}?${params}`,
      )
      if (!response.ok) {
        toast({
          title: 'Error',
          description: 'Failed to fetch pipedream apps',
          variant: 'destructive',
        })
        return []
      }

      const data = await response.json()
      return data.apps
    },
    opts,
  )

  return useMemo(
    () => ({
      data,
      mutate,
      ...rest,
    }),
    [data, mutate, rest],
  )
}
