import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { type PipedreamIntegrationWithCounts } from '@latitude-data/core/schema/types'

const EMPTY_ARRAY: PipedreamIntegrationWithCounts[] = []

/**
 * This hook fetch integrations that are connected in our DB
 * of type pipedream.
 * You can fetch integrations that have tools, triggers or both.
 */
export default function useConnectedIntegrationsByPipedreamApp({
  withTools,
  withTriggers,
  ...opts
}: SWRConfiguration & {
  withTools?: boolean
  withTriggers?: boolean
} = {}) {
  let searchParams: Record<string, string> = {}
  if (withTools !== undefined) {
    searchParams.withTools = withTools ? 'true' : 'false'
  }
  if (withTriggers !== undefined) {
    searchParams.withTriggers = withTriggers ? 'true' : 'false'
  }
  const fetcher = useFetcher<PipedreamIntegrationWithCounts[]>(
    ROUTES.api.integrations.pipedream.connectedByApp,
    {
      searchParams,
    },
  )
  const { data = EMPTY_ARRAY, isLoading } = useSWR<
    PipedreamIntegrationWithCounts[]
  >(
    [
      'connectedIntegrationsByPipedreamApp',
      withTools ?? false,
      withTriggers ?? false,
    ],
    fetcher,
    opts,
  )

  return useMemo(
    () => ({
      data,
      isLoading,
    }),
    [data, isLoading],
  )
}
