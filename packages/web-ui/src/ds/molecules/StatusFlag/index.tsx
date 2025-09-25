import { Icon } from '../../atoms/Icons'

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
  backgroundColor: string
}) {
  return (
    <div
      className={`flex items-center justify-center w-4 h-4 gap-3 rounded-full ${backgroundColor}`}
    >
      {state === StatusFlagState.completed ? (
        <Icon name='checkClean' color='white' className='w-3 h-3' />
      ) : null}
    </div>
  )
}
