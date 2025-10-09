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
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/schema/types'
import { INTEGRATION_TYPE_VALUES } from '$/lib/integrationTypeOptions'
import { pluralize } from '$/components/TriggersManagement/NewTrigger/IntegrationsList/utils'
import useIntegrations from '$/stores/integrations'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { mergeConnectedAppsBySlug } from '@latitude-data/core/lib/pipedream/mergeConnectedAppsBySlug'
import { ConnectPipedreamModal } from './ConnectPipedreamModal'
import { AppDto } from '@latitude-data/core/constants'

type ToolType = IntegrationType | 'UnConnectedPipedreamApp'

type IConnectToolContext = {
  onAdd: () => void
  onConnect: (app: AppDto) => void
}

const ConnectToolContext = createContext<IConnectToolContext>({
  onAdd: () => {},
  onConnect: (_app: AppDto) => {},
})

function integrationOptions(integration: IntegrationDto) {
  if (integration.type === IntegrationType.Pipedream) {
    const imageUrl = integration.configuration.metadata?.imageUrl ?? 'unplug'
    const label =
      integration.configuration.metadata?.displayName ??
      integration.configuration.appName
    return {
      label,
      icon: {
        type: 'image' as const,
        src: imageUrl,
        alt: label,
      },
    }
  }

  if (integration.type === IntegrationType.Latitude) {
    const { label } = INTEGRATION_TYPE_VALUES[IntegrationType.Latitude]
    return {
      label,
      icon: {
        type: 'icon' as const,
        name: 'logo' as IconName,
      },
    }
  }
  const { label, icon } = INTEGRATION_TYPE_VALUES[integration.type]
  return { label, icon: { type: 'icon' as const, name: icon as IconName } }
}

function getToolsAndAccountsLabel({
  type,
  toolCount,
  accountCount,
}: {
  type: ToolType
  toolCount?: number
  accountCount?: number
}) {
  if (type === 'UnConnectedPipedreamApp') {
    const tools = pluralize(toolCount ?? 0, 'available tool', 'available tools')
    return tools
  }
  if (type !== IntegrationType.Pipedream) return ''

  return pluralize(accountCount ?? 1, 'account', 'accounts')
}

function ItemPresenter({ item }: ItemPresenterProps<ToolType>) {
  const type = item.metadata?.type
  const imageIcon = item.imageIcon
  const title = item.title
  const app = item.metadata?.app as AppDto | undefined
  const { onAdd, onConnect } = use(ConnectToolContext)
  const buttonLabel = type === 'UnConnectedPipedreamApp' ? 'Connect' : 'Add'
  const buttonVariant =
    type === 'UnConnectedPipedreamApp' ? 'outline' : 'default'
  const onClick = useCallback(() => {
    if (type === 'UnConnectedPipedreamApp' && app) {
      onConnect(app)
      return
    }

    onAdd()
  }, [onAdd, onConnect, app, type])
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
}: {
  onCloseModal: () => void
}) {
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

  const { data: integrations, isLoading: isLoadingConnectedIntegrations } =
    useIntegrations({
      withTools: true,
      includeLatitudeTools: true,
    })

  const connectedApps = useMemo(() => {
    if (!integrations) return []
    return mergeAllConnectedApps(integrations)
  }, [integrations])
  const isLoading = connectedApps.length === 0 && isLoadingConnectedIntegrations

  // TODO: Filter active tool-sets. If Slack is used in this document, don't show it here
  // Will pass active tool types as prop to this component
  const optionGroups = useMemo<SearchableOption<ToolType>[]>(() => {
    const items: SearchableOptionItem<ToolType>[] | null[] = connectedApps
      .map((integration) => {
        const labelIcon = integrationOptions(integration)
        if (!labelIcon) return null
        return {
          type: 'item' as const,
          value: String(integration.id),
          title: labelIcon.label,
          description: getToolsAndAccountsLabel({
            type: integration.type,
            accountCount:
              integration.type === IntegrationType.Pipedream
                ? integration.accountCount
                : undefined,
          }),
          keywords: [labelIcon.label, integration.type],
          metadata: { type: integration.type },
          imageIcon: labelIcon.icon,
        }
      })
      .filter((item) => item !== null)
      .filter((item) =>
        item.title.toLowerCase().includes(immediateQuery.trim().toLowerCase()),
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
    connectedApps,
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
  const [connectingApp, setConnectingApp] = useState<AppDto | null>(null)
  const onAdd = useCallback(() => {
    console.log('Add clicked')
    onCloseModal()
  }, [onCloseModal])
  const onConnect = useCallback((connectedApp: AppDto) => {
    setConnectingApp(connectedApp)
  }, [])
  const onConnectSuccess = useCallback(
    (newIntegration: PipedreamIntegration) => {
      console.log('Connected', newIntegration)
      setConnectingApp(null)
      onAdd()
    },
    [onAdd, setConnectingApp],
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
