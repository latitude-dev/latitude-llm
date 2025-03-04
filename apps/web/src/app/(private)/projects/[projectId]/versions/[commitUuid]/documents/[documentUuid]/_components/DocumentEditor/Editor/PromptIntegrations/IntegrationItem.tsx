import { integrationOptions } from '$/lib/integrationTypeOptions'
import { IntegrationDto } from '@latitude-data/core/browser'
import { cn, Icon, Skeleton, Text } from '@latitude-data/web-ui'

export function IntegrationItemPlaceholder() {
  return (
    <div className='flex flex-col gap-1 p-4 border-b border-border'>
      <Skeleton height='h6' className='w-40' />
      <div className='flex gap-2'>
        <Skeleton height='h6' className='w-8' />
        <Skeleton height='h6' className='w-20' />
      </div>
    </div>
  )
}

export function IntegrationItem({
  integration,
  isActive,
  isSelected,
  onSelect,
}: {
  integration: IntegrationDto
  isActive: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  const values = integrationOptions(integration) ?? {
    icon: 'mcp',
    label: integration.type,
  }

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
      onClick={onSelect}
    >
      <Text.H5B color={isActive ? 'accentForeground' : 'foreground'}>
        {integration.name}
      </Text.H5B>
      <div className='flex flex-row items-center gap-2'>
        <Icon
          name={values.icon}
          color={isActive ? 'accentForeground' : 'foregroundMuted'}
        />
        <Text.H6 color={isActive ? 'accentForeground' : 'foregroundMuted'}>
          {values.label}
        </Text.H6>
      </div>
    </div>
  )
}
