import type { AppDto, IntegrationDto } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { type SWRConfiguration } from 'swr'
import { IntegrationType, type McpTool } from '@latitude-data/constants'
import { useMemo } from 'react'

const EMPTY_ARRAY: McpTool[] = []

export type McpToolDto = McpTool & {
  displayName?: string
}

type ToolResponse = { data: McpTool[]; ok: true } | { errorMessage: string; ok: false }

type AppResponse = { data: AppDto; ok: true } | { errorMessage: string; ok: false }

export default function useIntegrationTools(integration?: IntegrationDto, opts?: SWRConfiguration) {
  const fetcher = useFetcher<McpTool[], ToolResponse>(
    integration ? ROUTES.api.integrations.detail(integration.name).listTools.root : undefined,
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
    data: toolsData = EMPTY_ARRAY,
    isLoading,
    isValidating,
    error,
  } = useSWR<McpTool[]>(['integrationTools', integration?.name], fetcher, opts)

  const displayNameFetcher = useFetcher<AppDto | undefined, AppResponse>(
    integration?.type === IntegrationType.Pipedream
      ? ROUTES.api.integrations.pipedream.detail(integration.configuration.appName).root
      : undefined,
    {
      serializer: (response) => {
        if (!response.ok) return undefined
        return response.data
      },
    },
  )

  const { data: appData = undefined } = useSWR<AppDto | undefined>(
    ['integrationApp', integration?.id],
    displayNameFetcher,
  )

  const data = useMemo<McpToolDto[] | undefined>(() => {
    if (!toolsData) return undefined
    if (!appData) return toolsData

    return toolsData.map((tool) => {
      const displayName = appData.tools?.find((action) => action.key === tool.name)?.name

      if (!displayName) return tool
      return {
        ...tool,
        displayName,
      }
    })
  }, [toolsData, appData])

  return {
    data,
    isLoading,
    isValidating,
    error,
  }
}
