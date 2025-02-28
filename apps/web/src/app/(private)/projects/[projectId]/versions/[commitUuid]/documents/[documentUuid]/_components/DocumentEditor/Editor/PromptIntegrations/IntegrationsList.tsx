import { INTEGRATION_TYPE_VALUES } from '$/app/(private)/settings/_components/Integrations/New'
import useIntegrationTools from '$/stores/integrationTools'
import { Integration } from '@latitude-data/core/browser'
import { Badge, cn, Icon, Text, Tooltip } from '@latitude-data/web-ui'
import { useState } from 'react'
import { ActiveIntegrations } from './utils'

export function IntegrationsList({
  integrations,
  activeIntegrations,
}: {
  integrations: Integration[]
  activeIntegrations: ActiveIntegrations
}) {
  const [selectedIntegration, setSelectedIntegration] =
    useState<Integration | null>(null)

  const { data: integrationTools } = useIntegrationTools(
    selectedIntegration ?? undefined,
  )

  return (
    <div className='flex flex-row w-full max-h-full overflow-hidden'>
      <div className='flex flex-col w-full border-r border-border overflow-auto custom-scrollbar'>
        {integrations.map((integration) => {
          const isSelected = selectedIntegration?.id === integration.id
          const values = INTEGRATION_TYPE_VALUES[integration.type]
          return (
            <div
              key={integration.id}
              className={cn(
                'flex flex-col gap-1 p-4 cursor-pointer border-b border-border',
                {
                  'hover:bg-muted': !isSelected,
                  'bg-accent': isSelected,
                },
              )}
              onClick={() => setSelectedIntegration(integration)}
            >
              <Text.H5B color={isSelected ? 'accentForeground' : 'foreground'}>
                {integration.name}
              </Text.H5B>
              <div className='flex flex-row items-center gap-2'>
                <Icon
                  name={values.icon}
                  color={isSelected ? 'accentForeground' : 'foregroundMuted'}
                />
                <Text.H6
                  color={isSelected ? 'accentForeground' : 'foregroundMuted'}
                >
                  {values.label}
                </Text.H6>
              </div>
            </div>
          )
        })}
        <div
          className={cn(
            'flex gap-2 p-4 cursor-pointer border-b border-border items-center hover:bg-muted',
          )}
        >
          <Icon name='addSquare' color='foregroundMuted' />
          <Text.H6 color='foregroundMuted'>Add new integration</Text.H6>
        </div>
      </div>
      <div className='flex flex-col w-full overflow-auto custom-scrollbar'>
        <div className='flex flex-row items-center gap-2 p-4'>
          <Text.H6B>Enable all tools</Text.H6B>
        </div>

        {integrationTools?.map((tool) => {
          const integrationTools = selectedIntegration
            ? ((activeIntegrations[selectedIntegration?.name] ?? []) as
                | true
                | string[])
            : []
          const isActive =
            integrationTools === true || integrationTools?.includes(tool.name)

          return (
            <div
              key={tool.name}
              className='flex flex-col gap-2 p-4 border-t border-border'
            >
              <Text.H6B color='foreground'>{tool.name}</Text.H6B>
              <Text.H6 color='foregroundMuted'>{tool.description}</Text.H6>
              <div className='flex flex-wrap items-center'>
                {Object.keys(tool.inputSchema.properties).map((property) => {
                  const type = tool.inputSchema.properties[property]!.type
                  const description =
                    tool.inputSchema.properties[property]!.description
                  return (
                    <Tooltip
                      key={property}
                      className='cursor-default'
                      trigger={
                        <Badge
                          key={property}
                          variant='muted'
                          className='mr-2 cursor-default'
                        >
                          {property}
                        </Badge>
                      }
                      side='top'
                      align='center'
                    >
                      <div className='flex flex-col gap-2'>
                        <div className='flex flex-row gap-2 items-center'>
                          <Text.H6B color='background'>{property}</Text.H6B>
                          <Text.H7 color='background'>{type}</Text.H7>
                        </div>
                        {description && (
                          <Text.H6 color='background'>{description}</Text.H6>
                        )}
                      </div>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
