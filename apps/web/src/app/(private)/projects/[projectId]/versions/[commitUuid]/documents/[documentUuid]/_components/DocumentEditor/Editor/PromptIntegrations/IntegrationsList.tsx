import { IntegrationDto } from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useState } from 'react'
import { ActiveIntegrations } from './utils'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { IntegrationItem, IntegrationItemPlaceholder } from './IntegrationItem'
import { IntegrationToolsList } from './IntegrationTools'

export function IntegrationsListPlaceholder() {
  return (
    <div className='flex flex-row w-full max-h-full overflow-hidden'>
      <div className='flex flex-col w-1/2 max-h-full border-r border-border overflow-hidden'>
        <IntegrationItemPlaceholder />
        <IntegrationItemPlaceholder />
        <IntegrationItemPlaceholder />
      </div>
    </div>
  )
}

export function IntegrationsList({
  disabled,
  integrations,
  activeIntegrations,
  addIntegrationTool,
  removeIntegrationTool,
}: {
  integrations: IntegrationDto[]
  activeIntegrations: ActiveIntegrations
  addIntegrationTool: (integrationName: string, toolName: string) => void
  removeIntegrationTool: (
    integrationName: string,
    toolName: string,
    toolNames: string[],
  ) => void
  disabled?: boolean
}) {
  const [selectedIntegration, setSelectedIntegration] =
    useState<IntegrationDto | null>(null)

  return (
    <div className='flex flex-row w-full max-h-full overflow-hidden'>
      <div className='flex flex-col w-full border-r border-border overflow-auto custom-scrollbar'>
        {integrations.map((integration) => (
          <IntegrationItem
            key={integration.id}
            integration={integration}
            isActive={activeIntegrations[integration.name] !== undefined}
            isSelected={selectedIntegration?.id === integration.id}
            onSelect={() => setSelectedIntegration(integration)}
          />
        ))}
        <Link href={ROUTES.settings.integrations.new.root}>
          <div
            className={cn(
              'flex gap-2 p-4 cursor-pointer border-b border-border items-center hover:bg-muted',
            )}
          >
            <Icon name='addSquare' color='foregroundMuted' />
            <Text.H6 color='foregroundMuted'>Add new integration</Text.H6>
          </div>
        </Link>
      </div>
      <div className='flex flex-col w-full overflow-auto custom-scrollbar relative'>
        {selectedIntegration && (
          <IntegrationToolsList
            disabled={disabled}
            integration={selectedIntegration}
            activeTools={activeIntegrations[selectedIntegration.name]}
            addIntegrationTool={addIntegrationTool}
            removeIntegrationTool={removeIntegrationTool}
          />
        )}
      </div>
    </div>
  )
}
