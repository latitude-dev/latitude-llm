import type { Integration } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { McpTool } from '@latitude-data/constants'

const EMPTY_ARRAY: McpTool[] = []

export default function useIntegrationTools(
  integration?: Integration,
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    integration
      ? ROUTES.api.integrations.detail(integration.name).listTools.root
      : undefined,
  )
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<McpTool[]>(
    `api/integrations/${integration?.name}/listTools`,
    fetcher,
    opts,
  )

  return {
    data,
    mutate,
    ...rest,
  }
}
