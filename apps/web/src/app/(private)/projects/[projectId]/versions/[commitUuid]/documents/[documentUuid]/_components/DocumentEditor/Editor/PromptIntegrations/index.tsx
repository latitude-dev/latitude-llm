import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { ButtonWithBadge } from '@latitude-data/web-ui/molecules/ButtonWithBadge'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { useState } from 'react'
import { useActiveIntegrations } from './useActiveIntegrations'
import useIntegrations from '$/stores/integrations'
import { IntegrationsList } from './IntegrationsList'

export function PromptIntegrations({
  prompt,
  onChangePrompt,
  disabled,
}: {
  prompt: string
  onChangePrompt: (prompt: string) => void
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const { data: integrations, isLoading } = useIntegrations({
    includeLatitudeTools: true,
  })
  const {
    isInitialized,
    activeIntegrations,
    addIntegrationTool,
    removeIntegrationTool,
  } = useActiveIntegrations({
    prompt,
    onChangePrompt,
    integrations,
    isLoading,
  })

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <ButtonWithBadge
          ellipsis
          disabled={disabled || !isInitialized}
          childrenOnlyText
          badgeAnchor='center'
          variant='outline'
          onClick={() => setIsOpen(true)}
          iconProps={{
            name: !isInitialized ? 'loader' : 'blocks',
            spin: !isInitialized,
            className: 'my-0.5',
          }}
          badge={
            Object.keys(activeIntegrations).length > 0 && (
              <Badge centered variant='default' shape='rounded' size='small'>
                {Object.keys(activeIntegrations).length}
              </Badge>
            )
          }
        >
          Tools
        </ButtonWithBadge>
      </Popover.Trigger>
      <Popover.Content
        side='bottom'
        align='end'
        maxHeight='normal'
        style={{ width: 600, maxWidth: 600, padding: 0 }}
        onOpenAutoFocus={(event) => {
          event.preventDefault() // fixes https://github.com/radix-ui/primitives/issues/2248
        }}
      >
        <IntegrationsList
          disabled={disabled}
          isLoading={!isInitialized}
          integrations={integrations ?? []}
          activeIntegrations={activeIntegrations}
          addIntegrationTool={addIntegrationTool}
          removeIntegrationTool={removeIntegrationTool}
        />
      </Popover.Content>
    </Popover.Root>
  )
}
