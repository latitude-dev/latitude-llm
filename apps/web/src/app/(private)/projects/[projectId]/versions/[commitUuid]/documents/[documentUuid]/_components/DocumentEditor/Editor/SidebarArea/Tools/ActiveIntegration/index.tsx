import { use, useCallback, MouseEvent, useMemo } from 'react'
import Image from 'next/image'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { ToolList } from './ToolList'
import {
  ActiveIntegration as IActiveIntegration,
  ImageIcon,
} from '../../toolsHelpers/types'
import { ToolsContext } from '../ToolsProvider'
import { useSidebarStore } from '../../hooks/useSidebarStore'
import { CLIENT_TOOLS_INTEGRATION_NAME } from '../../toolsHelpers/collectTools'
import { useLazyToolCount } from './useLazyToolCount'
import { IntegrationType } from '@latitude-data/constants'
import { INTEGRATION_TYPE_VALUES } from '$/lib/integrationTypeOptions'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { parseMarkdownLinks } from '$/components/Pipedream/utils'
import { CustomMcpHeadersButton } from './CustomMcpHeaders'

function ImageIconComponent({ imageIcon }: { imageIcon?: ImageIcon }) {
  if (!imageIcon) return null
  if (!imageIcon?.type) return null

  if (imageIcon.type === 'image') {
    return (
      <Image
        unoptimized
        src={imageIcon.src}
        alt={imageIcon.alt}
        width={16}
        height={16}
        style={{ width: 16, height: 16 }}
      />
    )
  }

  return <Icon name={imageIcon.name} size='normal' />
}

export function ActiveIntegration({
  integration,
  onRemove,
}: {
  integration: IActiveIntegration
  onRemove: (integrationName: string) => void
}) {
  const { addIntegrationTool, removeIntegrationTool } = use(ToolsContext)
  const toggleIntegration = useSidebarStore((state) => state.toggleIntegration)
  const { commit } = useCurrentCommit()
  const isLive = !!commit.mergedAt

  const isClientTools = integration.name === CLIENT_TOOLS_INTEGRATION_NAME
  const isLatitude = integration.type === IntegrationType.Latitude

  const displayName = isClientTools
    ? 'Client tools'
    : isLatitude
      ? INTEGRATION_TYPE_VALUES[IntegrationType.Latitude].label
      : integration.name

  const allEnabled = integration.tools === true
  const isOpen = integration.isOpen

  // Get app description for Pipedream integrations
  const isPipedream = integration.type === IntegrationType.Pipedream
  const config = integration.configuration
  const appNameSlug =
    isPipedream && config !== null && 'appName' in config
      ? config.appName
      : undefined
  const { data: pipedreamApp } = usePipedreamApp(appNameSlug, {
    withConfig: false,
  })

  // Get description for tooltip (only Pipedream)
  const description = useMemo(() => {
    if (isClientTools) return null
    if (isPipedream && pipedreamApp?.description) {
      return parseMarkdownLinks(pipedreamApp.description)
    }
    return null
  }, [isClientTools, isPipedream, pipedreamApp])

  // Lazily fetch tool count in the background if not already loaded
  const { isLoadingCount } = useLazyToolCount(integration)

  // Calculate tool counts from store data
  const { totalCount, activeCount, hasToolsLoaded } = useMemo(() => {
    const total = integration.allToolNames.length
    const active =
      integration.tools === true
        ? total
        : Array.isArray(integration.tools)
          ? integration.tools.length
          : 0
    const loaded = total > 0

    return { totalCount: total, activeCount: active, hasToolsLoaded: loaded }
  }, [integration.allToolNames, integration.tools])

  const toggleAllEnabled = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      if (isLive) return

      if (allEnabled) {
        removeIntegrationTool({
          integrationName: integration.name,
          toolName: '*',
          allToolNames: integration.allToolNames,
        })
      } else {
        addIntegrationTool({
          integrationName: integration.name,
          toolName: '*',
        })
      }
    },
    [
      isLive,
      allEnabled,
      integration.name,
      integration.allToolNames,
      addIntegrationTool,
      removeIntegrationTool,
    ],
  )

  const integrationContent = (
    <>
      <div
        onClick={() => toggleIntegration(integration.name)}
        className='flex items-center gap-2 min-w-0 cursor-pointer'
      >
        <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} />
        <ImageIconComponent imageIcon={integration.icon} />
        <Text.H5M ellipsis noWrap>
          {displayName}
        </Text.H5M>
      </div>
      {!isClientTools && isOpen && (
        <div onClick={toggleAllEnabled}>
          <SwitchToggle
            checked={allEnabled}
            onClick={toggleAllEnabled}
            disabled={isLive}
          />
        </div>
      )}
    </>
  )

  return (
    <div className='flex flex-col'>
      <div className='flex items-center justify-between gap-x-2 min-w-0 min-h-7'>
        <div
          role='button'
          tabIndex={0}
          aria-expanded={isOpen}
          aria-controls={`integration-tools-${integration.name}`}
          className='flex items-center gap-2 min-w-0'
        >
          {description ? (
            <>
              <Tooltip
                side='top'
                align='start'
                trigger={
                  <div
                    onClick={() => toggleIntegration(integration.name)}
                    className='flex items-center gap-2 min-w-0 cursor-pointer'
                  >
                    <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} />
                    <ImageIconComponent imageIcon={integration.icon} />
                    <Text.H5M ellipsis noWrap showNativeTitle={false}>
                      {displayName}
                    </Text.H5M>
                  </div>
                }
              >
                <div
                  className='text-background [&>a]:underline [&>a]:text-background'
                  dangerouslySetInnerHTML={{
                    __html: `
                      <strong>${displayName}</strong><br/>
                      ${description}
                    `,
                  }}
                />
              </Tooltip>
              {!isClientTools && isOpen && (
                <div onClick={toggleAllEnabled}>
                  <SwitchToggle
                    checked={allEnabled}
                    onClick={toggleAllEnabled}
                    disabled={isLive}
                  />
                </div>
              )}
            </>
          ) : (
            integrationContent
          )}
        </div>

        <div className='flex items-center gap-2'>
          {!isClientTools && (hasToolsLoaded || isLoadingCount) ? (
            <Text.H6 color='foregroundMuted' noWrap>
              {!isLoadingCount ? (
                <>
                  {activeCount} / {totalCount} tools
                </>
              ) : null}
            </Text.H6>
          ) : null}

          <CustomMcpHeadersButton integration={integration} />

          {!isClientTools && (
            <DropdownMenu
              options={[
                {
                  label: 'Remove',
                  type: 'destructive',
                  onClick: () => onRemove(integration.name),
                },
              ]}
              side='bottom'
              align='end'
              triggerButtonProps={{
                iconProps: { name: 'ellipsis' },
                variant: 'ghost',
                size: 'small',
                disabled: isLive,
              }}
            />
          )}
        </div>
      </div>

      {isOpen && (
        <div className='flex flex-col gap-1'>
          <ToolList integration={integration} />
        </div>
      )}
    </div>
  )
}
