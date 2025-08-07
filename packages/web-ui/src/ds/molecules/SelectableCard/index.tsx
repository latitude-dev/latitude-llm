import { cn } from '../../../lib/utils'
import { Icon } from '../../atoms/Icons'
import { Text } from '../../atoms/Text'

export function SelectableCard({
  title,
  description,
  selected,
  onClick,
}: {
  title: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <div
      className={cn(
        'relative p-2 flex flex-row gap-1 items-start cursor-pointer rounded-lg border',
        {
          'bg-primary/10 border-primary/20': selected,
          'hover:bg-secondary border-border': !selected,
        },
      )}
      onClick={onClick}
    >
      {selected && (
        <div className='absolute right-2 top-2'>
          <Icon name='check' color='accentForeground' />
        </div>
      )}
      <div className='w-full flex flex-col gap-1'>
        <Text.H5M color={selected ? 'accentForeground' : 'foreground'}>
          {title.length > 30 ? `${title.slice(0, 30)}...` : title}
        </Text.H5M>
        {description.length > 0 && (
          <Text.H6 color={selected ? 'accentForeground' : 'foregroundMuted'}>{description}</Text.H6>
        )}
      </div>
    </div>
  )
}
