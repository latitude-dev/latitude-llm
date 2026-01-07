'use client'

import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import useIntegrationTools from '$/stores/integrationTools'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'

function ToolItemPlaceholder() {
  return (
    <div className='flex flex-col gap-2 p-4 border-t border-border'>
      <Skeleton className='w-48' height='h5' />
      <Skeleton className='w-full' height='h6' />
      <div className='flex gap-2'>
        <Skeleton className='w-16' height='h6' />
        <Skeleton className='w-16' height='h6' />
      </div>
    </div>
  )
}

export function ToolsModal({
  integration,
  onClose,
}: {
  integration: IntegrationDto
  onClose: () => void
}) {
  const { data: tools, isLoading, error } = useIntegrationTools(integration)

  return (
    <Modal
      open
      dismissible
      onOpenChange={(open) => !open && onClose()}
      title={`Tools - ${integration.name}`}
      description='Available tools provided by this integration'
      size='large'
    >
      <div className='flex flex-col max-h-[60vh] overflow-y-auto'>
        {isLoading && (
          <>
            <ToolItemPlaceholder />
            <ToolItemPlaceholder />
            <ToolItemPlaceholder />
          </>
        )}

        {error && (
          <div className='flex flex-col gap-2 p-4 bg-destructive-muted rounded-md'>
            <Text.H5B color='destructiveMutedForeground'>
              Error loading tools
            </Text.H5B>
            <Text.H6 color='destructiveMutedForeground'>
              {error.message}
            </Text.H6>
          </div>
        )}

        {!isLoading && !error && tools?.length === 0 && (
          <div className='flex flex-col gap-2 p-4'>
            <Text.H5 color='foregroundMuted'>
              No tools available for this integration.
            </Text.H5>
          </div>
        )}

        {!isLoading &&
          !error &&
          tools?.map((tool, index) => (
            <div
              key={tool.name}
              className={`flex flex-col gap-2 p-4 ${index > 0 ? 'border-t border-border' : ''}`}
            >
              <Text.H5B color='foreground'>
                {tool.displayName ?? tool.name}
              </Text.H5B>
              {tool.description && (
                <Text.H6 color='foregroundMuted'>{tool.description}</Text.H6>
              )}
              {tool.inputSchema?.properties &&
                Object.keys(tool.inputSchema.properties).length > 0 && (
                  <div className='flex flex-wrap items-center gap-2'>
                    {Object.entries(tool.inputSchema.properties).map(
                      ([property, schema]) => {
                        const propertySchema = schema as {
                          type?: string
                          description?: string
                        }
                        return (
                          <Tooltip
                            key={property}
                            trigger={
                              <Badge variant='muted' className='cursor-default'>
                                {property}
                              </Badge>
                            }
                            side='top'
                            align='center'
                          >
                            <div className='flex flex-col gap-1'>
                              <div className='flex flex-row gap-2 items-center'>
                                <Text.H6B color='background'>
                                  {property}
                                </Text.H6B>
                                {propertySchema.type && (
                                  <Text.H7 color='background'>
                                    {propertySchema.type}
                                  </Text.H7>
                                )}
                              </div>
                              {propertySchema.description && (
                                <Text.H6 color='background'>
                                  {propertySchema.description}
                                </Text.H6>
                              )}
                            </div>
                          </Tooltip>
                        )
                      },
                    )}
                  </div>
                )}
            </div>
          ))}
      </div>
    </Modal>
  )
}
