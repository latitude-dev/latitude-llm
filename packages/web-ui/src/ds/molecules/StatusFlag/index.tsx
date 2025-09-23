import { Icon } from '../../atoms/Icons'
import { colors } from '../../tokens/colors'

export enum StatusFlagState {
  pending = 'pending',
  inProgress = 'inProgress',
  completed = 'completed',
}

export const statusFlagColors: Record<StatusFlagState, string> = {
  [StatusFlagState.pending]: colors.backgrounds.mutedForeground,
  [StatusFlagState.inProgress]: colors.backgrounds.latte,
  [StatusFlagState.completed]: colors.backgrounds.mutedForeground,
}

export function StatusFlag({ state }: { state: StatusFlagState }) {
  return (
    <div
      className={`flex items-center justify-center w-4 h-4 gap-3 opacity-50 rounded-full ${statusFlagColors[state]}`}
    >
      {state === StatusFlagState.completed ? (
        <Icon name='checkClean' color='white' className='w-3 h-3' />
      ) : null}
    </div>
  )
}
