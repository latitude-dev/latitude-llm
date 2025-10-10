import { use, useMemo, useState, useCallback, createContext } from 'react'
import {
  SearchableList,
  Option as SearchableOption,
  OptionItem as SearchableOptionItem,
  OptionGroup as SearchableOptionGroup,
  ItemPresenterProps,
  ImageIcon,
} from '@latitude-data/web-ui/molecules/SearchableList'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import usePipedreamApps from '$/stores/pipedreamApps'
import { useDebouncedCallback } from 'use-debounce'
import { IntegrationType } from '@latitude-data/constants'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/schema/types'
import { pluralize } from '$/components/TriggersManagement/NewTrigger/IntegrationsList/utils'
import useIntegrations from '$/stores/integrations'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { mergeConnectedAppsBySlug } from '@latitude-data/core/lib/pipedream/mergeConnectedAppsBySlug'
import { ConnectPipedreamModal } from './ConnectPipedreamModal'
import { AppDto } from '@latitude-data/core/constants'
import { integrationOptions } from '../hooks/utils'
import { getIntegrationData } from '../../toolsHelpers/utils'
import { useActiveIntegrationsStore } from '../hooks/useActiveIntegrationsStore'

type ToolType = IntegrationType | 'UnConnectedPipedreamApp'

type IConnectToolContext = {
  onAdd: (integration: IntegrationDto) => void
  onConnect: (app: AppDto) => void
}

const ConnectToolContext = createContext<IConnectToolContext>({
  onAdd: (_integration: IntegrationDto) => {},
  onConnect: (_app: AppDto) => {},
})

function getToolsAndAccountsLabel({
  type,
  toolCount,
}: {
  type: ToolType
  toolCount?: number
}) {
  if (type === 'UnConnectedPipedreamApp') {
    const tools = pluralize(toolCount ?? 0, 'available tool', 'available tools')
    return tools
  }
  return ''
}

function ItemPresenter({ item }: ItemPresenterProps<ToolType>) {
  const type = item.metadata?.type
  const imageIcon = item.imageIcon
  const title = item.title
  const app = item.metadata?.app as AppDto | undefined
  const integration = item.metadata?.integration as IntegrationDto | undefined
  const { onAdd, onConnect } = use(ConnectToolContext)
  const buttonLabel = type === 'UnConnectedPipedreamApp' ? 'Connect' : 'Add'
  const buttonVariant =
    type === 'UnConnectedPipedreamApp' ? 'outline' : 'default'
  const onClick = useCallback(() => {
    if (type === 'UnConnectedPipedreamApp' && app) {
      onConnect(app)
      return
    }

    if (integration) {
      onAdd(integration)
    }
  }, [onAdd, onConnect, app, integration, type])
  return (
    <div
      className={cn(
        'group p-4 cursor-pointer',
        'flex flex-row min-w-0 gap-x-4',
      )}
    >
      <div className='flex flex-row gap-x-4 min-w-0 flex-1'>
        {imageIcon ? (
          <div className='flex-none'>
            <ImageIcon imageIcon={imageIcon} />
          </div>
        ) : null}
        <div className='flex-1 flex flex-row items-center gap-x-2 min-w-0'>
          <div
            className={cn(
              'flex flex-col',
              'group-aria-selected:[&>span]:!text-accent-foreground min-w-0',
            )}
          >
            <Text.H4 ellipsis noWrap>
              {title}
            </Text.H4>
            <Text.H5 ellipsis noWrap color='foregroundMuted'>
              {item.description}
            </Text.H5>
          </div>
        </div>
        <div className='flex-none flex items-center'>
          <Button fancy variant={buttonVariant} size='small' onClick={onClick}>
            {buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function mergeAllConnectedApps(connectedApps: IntegrationDto[]) {
  const pipedreamApps = connectedApps.filter((app) => app.type === 'pipedream')
  const otherApps = connectedApps.filter((app) => app.type !== 'pipedream')

  const mergedPipedreamApps = mergeConnectedAppsBySlug(pipedreamApps)

  return [...otherApps, ...mergedPipedreamApps]
}

/**
 * List connected tools Latitude and 3rd party (Pipedream)
 */
export function ConnectToolsModal({
  onCloseModal,
  addNewIntegration,
}: {
  onCloseModal: () => void
  addNewIntegration: (args: { integration: any; toolName: string }) => void
}) {
  const activeIntegrations = useActiveIntegrationsStore(
    (state) => state.integrations,
  )
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
  } = usePipedreamApps({ query: searchQuery, withTools: true })

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
    const items: SearchableOptionItem<ToolType>[] | null[] =
      availableConnectedApps
        .map((integration) => {
          const labelIcon = integrationOptions(integration)
          if (!labelIcon) return null
          return {
            type: 'item' as const,
            value: String(integration.id),
            title: integration.name,
            description: '',
            keywords: [labelIcon.label, integration.type],
            metadata: { type: integration.type, integration },
            imageIcon: labelIcon.icon,
          }
        })
        .filter((item) => item !== null)
        .filter((item) =>
          item.title
            .toLowerCase()
            .includes(immediateQuery.trim().toLowerCase()),
        )

    const baseGroup: SearchableOptionGroup<ToolType> = {
      type: 'group',
      label: 'Available integrations',
      items,
      loading: isLoadingConnectedIntegrations,
    }

    const groups: SearchableOption<ToolType>[] = [baseGroup]
    const availableApps: SearchableOptionItem<ToolType>[] = pipedreamApps
      .filter(
        (app) =>
          // Filter out already connected apps (but allow multiple accounts of same app)
          !connectedApps.some(
            (integration) =>
              integration.type === IntegrationType.Pipedream &&
              integration.configuration.appName === app.nameSlug,
          ),
      )
      .map(
        (app) =>
          ({
            type: 'item',
            value: app.nameSlug,
            title: app.name,
            description: getToolsAndAccountsLabel({
              type: 'UnConnectedPipedreamApp',
              toolCount: app.tools.length,
            }),
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
    connectedApps,
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
  const [connectingApp, setConnectingApp] = useState<AppDto | null>(null)
  const onAdd = useCallback(
    (integrationDto: IntegrationDto) => {
      // Convert IntegrationDto to ActiveIntegration format
      const integrationData = getIntegrationData({
        name: integrationDto.name,
        integrations: [integrationDto],
      })
      if (!integrationData) return

      // Add all tools from this integration to the sidebar
      addNewIntegration({
        integration: {
          ...integrationData,
          tools: [],
          allToolNames: [],
        },
        toolName: '*',
      })
      onCloseModal()
    },
    [addNewIntegration, onCloseModal],
  )
  const onConnect = useCallback((connectedApp: AppDto) => {
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
