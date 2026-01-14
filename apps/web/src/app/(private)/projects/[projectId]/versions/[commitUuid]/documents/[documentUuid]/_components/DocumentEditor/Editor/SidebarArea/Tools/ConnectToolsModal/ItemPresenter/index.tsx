import { use, useState, useCallback, useMemo, type MouseEvent } from 'react'
import {
  ItemPresenterProps,
  ImageIcon,
} from '@latitude-data/web-ui/molecules/SearchableList'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { PipedreamAppCard } from '$/components/Pipedream/PipedreamCard'
import { pluralize } from '$/components/TriggersManagement/NewTrigger/IntegrationsList/utils'
import { App } from '@latitude-data/core/constants'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { PipedreamIntegration } from '@latitude-data/core/schema/models/types/Integration'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { ToolType } from '../index'
import { ConnectToolContext } from '../ConnectToolContext'
import useIntegrationTools from '$/stores/integrationTools'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { parseMarkdownLinks } from '$/components/Pipedream/utils'
import { IntegrationType } from '@latitude-data/constants'
import { ConnectPipedreamModal } from '../ConnectPipedreamModal'

function ToolItem({ tool }: { tool: { name: string; description?: string } }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const description = useMemo(
    () => parseMarkdownLinks(tool.description),
    [tool.description],
  )
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex-1 min-w-0'>
          <Text.H5>{tool.name}</Text.H5>
        </div>
        {tool.description && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className='text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0'
          >
            {isExpanded ? '− info' : '+ info'}
          </button>
        )}
      </div>
      {isExpanded && tool.description && (
        <Text.H6 color='foregroundMuted' wordBreak='breakWord'>
          <div
            className='[&>a]:underline [&>a]:text-foreground'
            dangerouslySetInnerHTML={{
              __html: description,
            }}
          />
        </Text.H6>
      )}
    </div>
  )
}

export function ItemPresenter({ item }: ItemPresenterProps<ToolType>) {
  const type = item.metadata?.type
  const imageIcon = item.imageIcon
  const title = item.title
  const app = item.metadata?.app as App | undefined
  const integration = item.metadata?.integration as IntegrationDto | undefined
  const integrations = item.metadata?.integrations as
    | IntegrationDto[]
    | undefined
  const integrationIds = item.metadata?.integrationIds as number[] | undefined
  const integrationNames = item.metadata?.integrationNames as
    | Array<{ id: number; name: string }>
    | undefined
  const appNameSlug = item.metadata?.appNameSlug as string | undefined
  const appImgSrc = item.metadata?.appImgSrc as string | undefined
  const { onAdd, onConnect } = use(ConnectToolContext)

  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<
    string | undefined
  >()
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [isSelectOpen, setIsSelectOpen] = useState(false)

  // For grouped Pipedream integrations
  const isGrouped = type === 'GroupedPipedream'
  const isSingleAccount = integrationIds && integrationIds.length === 1
  const accountsCount = integrationIds?.length ?? 0
  const isPipedream = isGrouped || type === 'UnConnectedPipedreamApp'
  const isUnconnected = type === 'UnConnectedPipedreamApp'
  const isMCP = type === IntegrationType.ExternalMCP
  const isLatitude = type === IntegrationType.Latitude
  const canExpand = (isPipedream && !isUnconnected) || isMCP || isLatitude

  // Fetch tools for MCP and Latitude integrations
  const { data: tools = [], isLoading: isLoadingTools } = useIntegrationTools(
    (isMCP || isLatitude) && integration ? integration : undefined,
  )

  const buttonLabel = type === 'UnConnectedPipedreamApp' ? 'Connect' : 'Add'
  const buttonVariant =
    type === 'UnConnectedPipedreamApp' ? 'outline' : 'default'

  const onClick = useCallback(() => {
    if (type === 'UnConnectedPipedreamApp' && app) {
      onConnect(app)
      return
    }

    if (isGrouped && isSingleAccount && integrations) {
      // Single account - add directly
      onAdd(integrations[0])
      return
    }

    if (integration) {
      onAdd(integration)
    }
  }, [
    onAdd,
    onConnect,
    app,
    integration,
    integrations,
    type,
    isGrouped,
    isSingleAccount,
  ])

  const handleAddSelected = useCallback(() => {
    if (selectedIntegrationId && integrations) {
      const selectedIntegration = integrations.find(
        (i) => String(i.id) === selectedIntegrationId,
      )
      if (selectedIntegration) {
        onAdd(selectedIntegration)
      }
    }
  }, [selectedIntegrationId, integrations, onAdd])

  const pipedreamApp = useMemo(() => {
    // For unconnected apps, use the app metadata directly
    if (type === 'UnConnectedPipedreamApp' && app) {
      return app
    }

    // For connected grouped apps, construct the app object
    if (!appNameSlug) return undefined

    return {
      nameSlug: appNameSlug,
      name: title,
      imgSrc: appImgSrc || '',
      description: '',
      categories: [],
      featuredWeight: 0,
    } as App
  }, [type, app, appNameSlug, title, appImgSrc])

  const handleHeaderClick = useCallback(() => {
    if (canExpand) {
      setIsExpanded(!isExpanded)
    }
  }, [canExpand, isExpanded])

  const handleButtonClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      onClick()
    },
    [onClick],
  )

  const handleToggleExpand = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      setIsExpanded(!isExpanded)
    },
    [isExpanded],
  )

  const handleOpenConnectModal = useCallback(() => {
    setIsSelectOpen(false) // Close the Select dropdown
    setIsConnectModalOpen(true)
  }, [])

  const handleCloseConnectModal = useCallback((open: boolean) => {
    setIsConnectModalOpen(open)
  }, [])

  const handleConnectSuccess = useCallback(
    (newIntegration: PipedreamIntegration) => {
      setIsConnectModalOpen(false)
      onAdd(newIntegration)
    },
    [onAdd],
  )

  // Single return with ternaries for all cases
  return (
    <div
      className={cn(
        'group cursor-pointer flex flex-col',
        isExpanded ? 'gap-4 p-4 border-b border-border' : 'p-4',
      )}
    >
      {/* Header - Always present */}
      <div
        className='flex flex-row gap-x-4 min-w-0'
        onClick={handleHeaderClick}
      >
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
            {!isExpanded && (
              <Text.H5 ellipsis noWrap color='foregroundMuted'>
                {isGrouped
                  ? pluralize(accountsCount, 'account', 'accounts')
                  : item.description}
              </Text.H5>
            )}
          </div>
        </div>
        <div className='flex-none flex items-center gap-2'>
          {/* Chevron for expandable items, Connect button for unconnected apps */}
          {canExpand ? (
            <Button
              variant='nope'
              size='small'
              iconProps={{ name: isExpanded ? 'chevronUp' : 'chevronDown' }}
              onClick={handleToggleExpand}
            />
          ) : (
            <Button fancy variant={buttonVariant} onClick={handleButtonClick}>
              {buttonLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <>
          {/* Pipedream: Selector for multiple accounts */}
          {isPipedream && isGrouped && accountsCount > 1 && (
            <div className='flex flex-col gap-2'>
              <Select
                name='integration-select'
                value={selectedIntegrationId}
                onChange={setSelectedIntegrationId}
                placeholder='Select an account'
                searchable
                open={isSelectOpen}
                onOpenChange={setIsSelectOpen}
                options={
                  integrationNames?.map(({ id, name }) => ({
                    label: name,
                    value: String(id),
                  })) || []
                }
                footerAction={{
                  label: 'Connect new account',
                  icon: 'plus',
                  onClick: handleOpenConnectModal,
                }}
              />
              <Button
                fancy
                variant={selectedIntegrationId ? 'default' : 'outline'}
                size='small'
                disabled={!selectedIntegrationId}
                onClick={handleAddSelected}
                className='w-full'
              >
                Add
              </Button>
            </div>
          )}

          {/* Pipedream: Add button for single account */}
          {isPipedream && (!isGrouped || accountsCount <= 1) && (
            <Button
              fancy
              variant='default'
              size='small'
              onClick={onClick}
              className='w-full'
            >
              Add
            </Button>
          )}

          {isPipedream && pipedreamApp && (
            <PipedreamAppCard app={pipedreamApp} onlyApps />
          )}

          {(isMCP || isLatitude) && (
            <>
              <Button
                fancy
                variant='default'
                size='small'
                onClick={onClick}
                className='w-full'
              >
                Add
              </Button>
              <CollapsibleBox
                title='Tools'
                icon='blocks'
                collapsedContentHeader={
                  <div className='flex w-full items-center justify-end'>
                    {isLoadingTools ? (
                      <Text.H5 color='foregroundMuted'>Loading...</Text.H5>
                    ) : tools.length > 0 ? (
                      <Text.H5 color='foregroundMuted'>
                        {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
                      </Text.H5>
                    ) : (
                      <Text.H5 color='foregroundMuted'>
                        No tools available
                      </Text.H5>
                    )}
                  </div>
                }
                expandedContentHeader={
                  <div className='flex w-full items-center justify-end'>
                    {isLoadingTools ? (
                      <Text.H5 color='foregroundMuted'>Loading...</Text.H5>
                    ) : tools.length > 0 ? (
                      <Text.H5 color='foregroundMuted'>
                        {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
                      </Text.H5>
                    ) : (
                      <Text.H5 color='foregroundMuted'>
                        No tools available
                      </Text.H5>
                    )}
                  </div>
                }
                expandedContent={
                  <div className='flex flex-col gap-4'>
                    {isLoadingTools ? (
                      <>
                        <Text.H5 color='foregroundMuted'>
                          Loading tools...
                        </Text.H5>
                      </>
                    ) : (
                      tools.map((tool) => (
                        <ToolItem key={tool.name} tool={tool} />
                      ))
                    )}
                  </div>
                }
              />
            </>
          )}
        </>
      )}
      {/* ConnectPipedreamModal for connecting new accounts */}
      {isConnectModalOpen && pipedreamApp && (
        <ConnectPipedreamModal
          onOpenChange={handleCloseConnectModal}
          onConnect={handleConnectSuccess}
          app={pipedreamApp}
        />
      )}
    </div>
  )
}
