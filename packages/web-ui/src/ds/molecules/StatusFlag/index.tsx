import { Icon } from '../../atoms/Icons'
import { BackgroundColor, colors } from '../../tokens/colors'
import { cn } from '../../../lib/utils'

export enum StatusFlagState {
  pending = 'pending',
  inProgress = 'inProgress',
  completed = 'completed',
}

export function StatusFlag({
  state,
  backgroundColor,
}: {
  state: StatusFlagState
  backgroundColor: BackgroundColor
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center w-4 h-4 gap-3 rounded-full',
        colors.backgrounds[backgroundColor],
      )}
    >
      {state === StatusFlagState.completed ? (
        <Icon name='checkClean' color='white' className='w-3 h-3' />
      ) : null}
    </div>
  )
}
