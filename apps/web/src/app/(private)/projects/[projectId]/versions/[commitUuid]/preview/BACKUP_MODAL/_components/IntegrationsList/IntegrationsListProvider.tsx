import { App } from '@pipedream/sdk/browser'
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { IntegrationDto } from '@latitude-data/core/browser'
import usePipedreamApps from '$/stores/pipedreamApps'
import useIntegrations from '$/stores/integrations'
import { IntegrationType } from '@latitude-data/constants'

type IntegrationsListContextType = {
  isLoadingConnectedIntegrations: boolean
  isLoadingPipedreamApps: boolean
  isLoading: boolean
  pipedreamApps: App[]
  allTriggersCount: number
  connectedIntegrations: IntegrationDto[]
  searchQuery: string
  setSearchQuery: (query: string) => void
}

const IntegrationsListContext = createContext<
  IntegrationsListContextType | undefined
>(undefined)

export function IntegrationsListProvider({
  children,
}: {
  children: ReactNode
}) {
  const [searchQuery, setSearchQuery] = useState<string>('')
  const { data: pipedreamApps, isLoading: isLoadingPipedreamApps } =
    usePipedreamApps({
      query: searchQuery,
    })
  const { data: integrations, isLoading: isLoadingConnectedIntegrations } =
    useIntegrations({
      withTriggers: true,
    })
  const isLoading = isLoadingPipedreamApps || isLoadingConnectedIntegrations

  const value: IntegrationsListContextType = useMemo(() => {
    const connectedIntegrations = integrations.filter(
      (integration: IntegrationDto) => {
        if (integration.type !== IntegrationType.Pipedream) return false
        if (!searchQuery) return true

        const query = searchQuery.toLowerCase()
        return (
          integration.name.toLowerCase().includes(query) ||
          integration.configuration!.appName.toLowerCase().includes(query)
        )
      },
    )
    return {
      isLoading,
      isLoadingPipedreamApps,
      isLoadingConnectedIntegrations,
      pipedreamApps,
      connectedIntegrations,
      searchQuery,
      setSearchQuery,
      allTriggersCount: pipedreamApps.length + connectedIntegrations.length,
    }
  }, [
    isLoading,
    isLoadingPipedreamApps,
    isLoadingConnectedIntegrations,
    pipedreamApps,
    searchQuery,
    setSearchQuery,
    integrations,
  ])

  return (
    <IntegrationsListContext.Provider value={value}>
      {children}
    </IntegrationsListContext.Provider>
  )
}

export function useIntegrationsListContext() {
  const context = useContext(IntegrationsListContext)
  if (context === undefined) {
    throw new Error(
      'useIntegrationsListContext must be used within a IntegrationsListProvider',
    )
  }
  return context
}
