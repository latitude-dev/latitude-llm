import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { IntegrationReference } from '@latitude-data/constants'
import { type IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'

const EMPTY_ARRAY: IntegrationReference[] = []

type ReferencesResponse =
  | { data: IntegrationReference[]; ok: true }
  | { errorMessage: string; ok: false }

export default function useIntegrationReferences(
  integration?: IntegrationDto,
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<IntegrationReference[], ReferencesResponse>(
    integration
      ? ROUTES.api.integrations.detail(integration.name).references.root
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

  const {
    data = EMPTY_ARRAY,
    isLoading,
    error,
  } = useSWR<IntegrationReference[]>(
    ['integrationReferences', integration?.name],
    fetcher,
    opts,
  )

  return {
    data,
    isLoading,
    error,
  }
}
