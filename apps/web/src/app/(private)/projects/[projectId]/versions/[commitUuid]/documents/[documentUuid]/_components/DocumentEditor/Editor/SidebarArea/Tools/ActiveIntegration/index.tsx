import { use, useCallback, MouseEvent, useMemo } from 'react'
import Image from 'next/image'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { ToolList } from './ToolList'
import {
  ActiveIntegration as IActiveIntegration,
  ImageIcon,
} from '../../toolsHelpers/types'
import { ToolsContext } from '../ToolsProvider'
import { useActiveIntegrationsStore } from '../hooks/useActiveIntegrationsStore'

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
  const toggleIntegration = useActiveIntegrationsStore(
    (state) => state.toggleIntegration,
  )
  const { commit } = useCurrentCommit()
  const isLive = !!commit.mergedAt

  const allEnabled = integration.tools === true
  const isOpen = integration.isOpen

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

  return (
    <div className='flex flex-col'>
      <div className='flex items-center justify-between gap-x-2 min-w-0 min-h-7'>
        <div
          role='button'
          tabIndex={0}
          aria-expanded={isOpen}
          aria-controls={`integration-tools-${integration.name}`}
          onClick={() => toggleIntegration(integration.name)}
          className='flex items-center gap-2 min-w-0'
        >
          <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} />
          <ImageIconComponent imageIcon={integration.icon} />
          <Text.H5M ellipsis noWrap>
            {integration.name}
          </Text.H5M>
          <div onClick={toggleAllEnabled}>
            <SwitchToggle
              checked={allEnabled}
              onClick={toggleAllEnabled}
              disabled={isLive}
            />
          </div>
        </div>

        <div className='flex items-center gap-2'>
          {hasToolsLoaded ? (
            <Text.H6 color='foregroundMuted' noWrap>
              {activeCount} / {totalCount} tools
            </Text.H6>
          ) : null}

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
