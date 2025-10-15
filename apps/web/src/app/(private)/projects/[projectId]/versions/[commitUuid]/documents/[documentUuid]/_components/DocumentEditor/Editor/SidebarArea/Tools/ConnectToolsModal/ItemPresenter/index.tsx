import { use, useState, useCallback, useMemo, type MouseEvent } from 'react'
import {
  ItemPresenterProps,
  ImageIcon,
} from '@latitude-data/web-ui/molecules/SearchableList'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { PipedreamAppCard } from '$/components/Pipedream/PipedreamCard'
import { pluralize } from '$/components/TriggersManagement/NewTrigger/IntegrationsList/utils'
import { AppDto } from '@latitude-data/core/constants'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { ToolType } from '../index'
import { ConnectToolContext } from '../ConnectToolContext'

export function ItemPresenter({ item }: ItemPresenterProps<ToolType>) {
  const type = item.metadata?.type
  const imageIcon = item.imageIcon
  const title = item.title
  const app = item.metadata?.app as AppDto | undefined
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

  // For grouped Pipedream integrations
  const isGrouped = type === 'GroupedPipedream'
  const isSingleAccount = integrationIds && integrationIds.length === 1
  const accountsCount = integrationIds?.length ?? 0
  const isPipedream = isGrouped || type === 'UnConnectedPipedreamApp'

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
      tools: [],
      triggers: [],
    } as AppDto
  }, [type, app, appNameSlug, title, appImgSrc])

  const handleHeaderClick = useCallback(() => {
    if (isPipedream) {
      setIsExpanded(!isExpanded)
    }
  }, [isPipedream, isExpanded])

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

  // Single return with ternaries for all cases
  return (
    <div
      className={cn(
        'group cursor-pointer flex flex-col',
        isPipedream && isExpanded ? 'gap-4 p-4 border-b border-border' : 'p-4',
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
          {/* Action button - Show for single account, unconnected, or non-Pipedream */}
          {isPipedream ? (
            <>
              {accountsCount <= 1 && (
                <Button
                  fancy
                  variant={buttonVariant}
                  size='small'
                  onClick={handleButtonClick}
                >
                  {buttonLabel}
                </Button>
              )}
              <Button
                variant='nope'
                size='small'
                iconProps={{ name: isExpanded ? 'chevronUp' : 'chevronDown' }}
                onClick={handleToggleExpand}
              />
            </>
          ) : (
            <Button
              fancy
              variant={buttonVariant}
              size='small'
              onClick={handleButtonClick}
            >
              {buttonLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded content - Only for Pipedream integrations */}
      {isPipedream && isExpanded && (
        <>
          {/* Selector for multiple accounts */}
          {isGrouped && accountsCount > 1 && (
            <div className='flex flex-col gap-2'>
              <Select
                name='integration-select'
                value={selectedIntegrationId}
                onChange={setSelectedIntegrationId}
                placeholder='Select an account'
                searchable
                options={
                  integrationNames?.map(({ id, name }) => ({
                    label: name,
                    value: String(id),
                  })) || []
                }
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

          {/* Always show PipedreamAppCard when expanded */}
          {pipedreamApp && <PipedreamAppCard app={pipedreamApp} onlyApps />}
        </>
      )}
    </div>
  )
}
