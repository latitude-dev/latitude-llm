import { Badge, ButtonWithBadge, Icon, Popover } from '@latitude-data/web-ui'
import { useState } from 'react'
import { useActiveIntegrations } from './utils'
import useIntegrations from '$/stores/integrations'
import {
  IntegrationsList,
  IntegrationsListPlaceholder,
} from './IntegrationsList'

export function PromptIntegrations({
  config,
  setConfig,
  disabled,
}: {
  config: Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
  disabled?: boolean
}) {
  const { data: integrations, isLoading } = useIntegrations({
    includeLatitudeTools: true,
  })

  const [isOpen, setIsOpen] = useState(false)
  const { activeIntegrations, addIntegrationTool, removeIntegrationTool } =
    useActiveIntegrations({
      config,
      setConfig,
      integrations: integrations ?? [],
    })

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <ButtonWithBadge
          variant='outline'
          onClick={() => setIsOpen(true)}
          badge={
            Object.keys(activeIntegrations).length > 0 && (
              <Badge variant='accent'>
                {Object.keys(activeIntegrations).length}
              </Badge>
            )
          }
        >
          <Icon name='blocks' size='normal' className='my-0.5' />
        </ButtonWithBadge>
      </Popover.Trigger>
      <Popover.Content
        side='right'
        align='start'
        sideOffset={8}
        alignOffset={-16}
        maxHeight='normal'
        style={{ width: 500, maxWidth: 500, padding: 0 }}
        onOpenAutoFocus={(event) => {
          event.preventDefault() // fixes https://github.com/radix-ui/primitives/issues/2248
        }}
      >
        {isLoading ? (
          <IntegrationsListPlaceholder />
        ) : (
          <IntegrationsList
            disabled={disabled}
            integrations={integrations ?? []}
            activeIntegrations={activeIntegrations}
            addIntegrationTool={addIntegrationTool}
            removeIntegrationTool={removeIntegrationTool}
          />
        )}
      </Popover.Content>
    </Popover.Root>
  )
}
