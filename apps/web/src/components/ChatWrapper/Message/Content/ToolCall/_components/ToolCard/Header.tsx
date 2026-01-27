import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { ReactNode } from 'react'
import { SimulationTag } from './SimulationTag'

export type ToolCallStatus = 'running' | 'waiting' | 'success' | 'error'

const statusIconColor = (status: ToolCallStatus): TextColor => {
  switch (status) {
    case 'running':
      return 'primaryForeground'
    case 'waiting':
      return 'foregroundMuted'
    case 'success':
      return 'successForeground'
    case 'error':
      return 'destructiveForeground'
    default:
      return 'foreground'
  }
}

const statusIcon = (status: ToolCallStatus): IconName => {
  switch (status) {
    case 'running':
      return 'loader'
    case 'waiting':
      return 'clock'
    case 'success':
      return 'checkClean'
    case 'error':
      return 'close'
  }
}

export function ToolCardHeader({
  icon,
  label,
  status,
  isOpen,
  onToggle,
  simulated,
}: {
  icon: ReactNode
  label: ReactNode
  status?: ToolCallStatus
  isOpen: boolean
  onToggle?: () => void
  simulated?: boolean
}) {
  return (
    <div
      className='sticky top-0 flex flex-row w-full bg-secondary hover:bg-secondary/80 cursor-pointer items-center p-2 gap-3 pr-3'
      onClick={onToggle}
    >
      <div className='flex min-w-8 h-8 rounded-xl bg-background items-center justify-center border border-border relative'>
        {icon}
        {status && (
          <div
            className={cn(
              'absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 p-0.5 rounded-full',
              {
                'bg-primary': status === 'running',
                'bg-background': status === 'waiting',
                'bg-success': status === 'success',
                'bg-destructive': status === 'error',
              },
            )}
          >
            <Icon
              name={statusIcon(status)}
              color={statusIconColor(status)}
              spin={status === 'running'}
              size='small'
              strokeWidth={3}
            />
          </div>
        )}
      </div>
      <div className='flex flex-col min-w-0 flex-1'>{label}</div>
      {simulated && <SimulationTag />}
      {onToggle && (
        <Icon
          name={isOpen ? 'chevronUp' : 'chevronDown'}
          color='foregroundMuted'
        />
      )}
    </div>
  )
}
