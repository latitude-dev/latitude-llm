import { useMemo, useState, useCallback } from 'react'
import {
  SearchableList,
  Option as SearchableOption,
  OptionItem as SearchableOptionItem,
  OptionGroup as SearchableOptionGroup,
} from '@latitude-data/web-ui/molecules/SearchableList'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import usePipedreamApps from '$/stores/pipedreamApps'
import { useDebouncedCallback } from 'use-debounce'
import { IntegrationType } from '@latitude-data/constants'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/schema/models/types/Integration'
import useIntegrations from '$/stores/integrations'
import { ConnectPipedreamModal } from './ConnectPipedreamModal'
import {
  getIntegrationData,
  type IntegrationData,
} from '../../toolsHelpers/utils'
import { useSidebarStore } from '../../hooks/useSidebarStore'
import { ConnectToolContext } from './ConnectToolContext'
import { ItemPresenter } from './ItemPresenter'
import { App } from '@latitude-data/core/constants'
import { integrationOptions } from '$/lib/integrationTypeOptions'

export type ToolType =
  | IntegrationType
  | 'UnConnectedPipedreamApp'
  | 'GroupedPipedream'

type IntegrationArg = IntegrationData & {
  tools: string[]
  allToolNames: string[]
  isOpen: boolean
}

/**
 * List connected tools Latitude and 3rd party (Pipedream)
 */
export function ConnectToolsModal({
  onCloseModal,
  addNewIntegration,
}: {
  onCloseModal: () => void
  addNewIntegration: (args: {
    integration: IntegrationArg
    toolName: string
  }) => void
}) {
  const activeIntegrations = useSidebarStore((state) => state.integrations)
  const [immediateQuery, setImmediateQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const debouncedSetSearchQuery = useDebouncedCallback(setSearchQuery, 500)
  const onSearchChange = useCallback(
    (value: string) => {
      setImmediateQuery(value)
      debouncedSetSearchQuery(value)
    },
    [debouncedSetSearchQuery],
  )
  const {
    data: pipedreamApps = [],
    isLoading: isLoadingPipedreamApps,
    loadMore,
    isLoadingMore,
    isReachingEnd,
    totalCount,
  } = usePipedreamApps({ query: searchQuery })

  const { data: connectedApps, isLoading: isLoadingConnectedIntegrations } =
    useIntegrations({
      withTools: true,
      includeLatitudeTools: true,
    })

  const availableConnectedApps = useMemo(
    () =>
      connectedApps.filter(
        (app) =>
          !activeIntegrations.some(
            (activeIntegration) => activeIntegration.name === app.name,
          ),
      ),
    [connectedApps, activeIntegrations],
  )

  const isLoading =
    availableConnectedApps.length === 0 && isLoadingConnectedIntegrations

  const optionGroups = useMemo<SearchableOption<ToolType>[]>(() => {
    // Group Pipedream integrations by appName
    const pipedreamIntegrations = availableConnectedApps.filter(
      (integration) => integration.type === IntegrationType.Pipedream,
    )
    const otherIntegrations = availableConnectedApps.filter(
      (integration) => integration.type !== IntegrationType.Pipedream,
    )

    // Group Pipedream by appName
    const pipedreamGroups = pipedreamIntegrations.reduce(
      (acc, integration) => {
        const config = integration.configuration as any
        const appName = config.appName
        if (!acc[appName]) {
          acc[appName] = []
        }
        acc[appName].push(integration)
        return acc
      },
      {} as Record<string, IntegrationDto[]>,
    )

    // Create items for non-Pipedream integrations
    const otherItems = otherIntegrations
      .filter((integration) => {
        const labelIcon = integrationOptions(integration)
        return labelIcon !== null
      })
      .map((integration) => {
        const labelIcon = integrationOptions(integration)!
        // Use label for Latitude integrations, name for others
        const title =
          integration.type === IntegrationType.Latitude
            ? labelIcon.label
            : integration.name

        return {
          type: 'item' as const,
          value: String(integration.id),
          title,
          description: '',
          keywords: [labelIcon.label, integration.type, integration.name],
          metadata: {
            type: integration.type,
            integration,
          },
          imageIcon: labelIcon.icon,
        } satisfies SearchableOptionItem<ToolType>
      })
      .filter((item) =>
        item.title.toLowerCase().includes(immediateQuery.trim().toLowerCase()),
      )

    // Create items for grouped Pipedream integrations
    const pipedreamItems = Object.entries(pipedreamGroups)
      .map(([appName, integrations]) => {
        const firstIntegration = integrations[0]
        const config = firstIntegration.configuration as any
        const displayName =
          config.metadata?.displayName || firstIntegration.name
        return {
          type: 'item' as const,
          value: appName,
          title: displayName,
          description: '',
          keywords: [config.appName, displayName, 'pipedream'],
          metadata: {
            type: 'GroupedPipedream' as ToolType,
            integrations,
            integrationIds: integrations.map((i) => i.id),
            integrationNames: integrations.map((i) => ({
              id: i.id,
              name: i.name,
            })),
            appNameSlug: config.appName,
            appImgSrc: config.metadata?.imageUrl || config.imgSrc || '',
          },
          imageIcon: {
            type: 'image' as const,
            src: config.metadata?.imageUrl || config.imgSrc || '',
            alt: displayName,
          },
        } satisfies SearchableOptionItem<ToolType>
      })
      .filter((item) =>
        item.title.toLowerCase().includes(immediateQuery.trim().toLowerCase()),
      )

    const allConnectedItems: SearchableOptionItem<ToolType>[] = [
      ...otherItems,
      ...pipedreamItems,
    ]

    const baseGroup: SearchableOptionGroup<ToolType> = {
      type: 'group',
      label: 'Available integrations',
      items: allConnectedItems,
      loading: isLoadingConnectedIntegrations,
    }

    const groups: SearchableOption<ToolType>[] = [baseGroup]
    const availableApps: SearchableOptionItem<ToolType>[] = pipedreamApps.map(
      (app) =>
        ({
          type: 'item',
          value: app.nameSlug,
          title: app.name,
          description: '',
          keywords: [app.name, app.nameSlug],
          metadata: {
            type: 'UnConnectedPipedreamApp',
            app,
          },
          imageIcon: {
            type: 'image',
            src: app.imgSrc,
            alt: app.name,
          },
        }) satisfies SearchableOptionItem<ToolType>,
    )

    groups.push({
      type: 'group',
      label: 'Connect a new integration',
      loading: isLoadingPipedreamApps,
      items: availableApps,
    })

    return groups
  }, [
    availableConnectedApps,
    isLoadingConnectedIntegrations,
    pipedreamApps,
    isLoadingPipedreamApps,
    immediateQuery,
  ])

  const infiniteScroll = useMemo(
    () => ({
      onReachBottom: loadMore,
      isLoadingMore,
      isReachingEnd,
      totalCount,
    }),
    [loadMore, isLoadingMore, isReachingEnd, totalCount],
  )
  const [connectingApp, setConnectingApp] = useState<App | null>(null)
  const onAdd = useCallback(
    (integrationDto: IntegrationDto) => {
      // Convert IntegrationDto to ActiveIntegration format
      const integrationData = getIntegrationData({
        name: integrationDto.name,
        integrations: [integrationDto],
      })
      if (!integrationData) return

      // Add integration to the sidebar without enabling any tools by default
      // allToolNames will be populated by the ToolList component after fetching tools
      // User can manually enable the tools they want
      addNewIntegration({
        integration: {
          ...integrationData,
          tools: [],
          allToolNames: [],
          isOpen: true,
        },
        toolName: '', // Empty toolName means no tools are enabled by default
      })
      onCloseModal()
    },
    [addNewIntegration, onCloseModal],
  )
  const onConnect = useCallback((connectedApp: App) => {
    setConnectingApp(connectedApp)
  }, [])
  const onConnectSuccess = useCallback(
    (newIntegration: PipedreamIntegration) => {
      setConnectingApp(null)
      onAdd(newIntegration)
    },
    [onAdd],
  )
  const onCloseConnect = useCallback((_open?: boolean) => {
    setConnectingApp(null)
  }, [])

  return (
    <>
      <Modal
        open
        dismissible
        scrollable={false}
        size='regular'
        height='screen'
        title='Add new toolset'
        description='Select one of your existing integrations or create a new one.'
        onOpenChange={onCloseModal}
      >
        <ConnectToolContext.Provider value={{ onAdd, onConnect }}>
          <SearchableList<ToolType>
            placeholder='Search integrations...'
            emptyMessage='No integrations found'
            multiGroup
            items={optionGroups}
            ItemPresenter={ItemPresenter}
            onSearchChange={onSearchChange}
            infiniteScroll={infiniteScroll}
            loading={isLoading}
          />
        </ConnectToolContext.Provider>
      </Modal>
      {connectingApp ? (
        <ConnectPipedreamModal
          onOpenChange={onCloseConnect}
          onConnect={onConnectSuccess}
          app={connectingApp}
        />
      ) : null}
    </>
  )
}
