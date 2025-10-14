import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import {
  StatusFlag,
  StatusFlagState,
} from '@latitude-data/web-ui/molecules/StatusFlag'

export default function SetupFormOptions({
  title,
  description,
  isSelected,
  onClick,
}: {
  title: string
  description: string
  isSelected: boolean
  onClick?: () => void
}) {
  return (
    <div
      className={cn(
        'gap-6 p-6 rounded-md cursor-pointer',
        isSelected && 'border-2 border-primary',
        !isSelected && 'border hover:border-primary/50',
      )}
      onClick={onClick}
    >
      <div className='flex flex-col gap-3'>
        <StatusFlag
          state={StatusFlagState.completed}
          backgroundColor={isSelected ? 'accentForeground' : 'mutedForeground'}
        />
        <div className='flex flex-col gap-1'>
          <Text.H3M>{title}</Text.H3M>
          <Text.H6 color='foregroundMuted'>{description}</Text.H6>
        </div>
      </div>
    </div>
  )
}
