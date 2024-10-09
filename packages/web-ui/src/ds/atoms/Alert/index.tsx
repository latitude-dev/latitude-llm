import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Icon, IconName } from '../Icons'
import {
  AlertDescription,
  AlertProps,
  AlertRoot,
  AlertTitle,
} from './Primitives'

type Props = {
  variant?: AlertProps['variant']
  title?: string
  description?: string
  cta?: ReactNode
  showIcon?: boolean
}
export function Alert({
  title,
  description,
  cta,
  showIcon = true,
  variant = 'default',
}: Props) {
  return (
    <AlertRoot variant={variant}>
      {showIcon && <Icon name='alert' />}
      <div className='flex flex-row items-center gap-4 justify-between'>
        <div className='flex flex-col gap-2'>
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </div>
        {cta}
      </div>
    </AlertRoot>
  )
}

type ProgressState = 'completed' | 'error' | 'running'
const ICON_NAME: Record<ProgressState, IconName> = {
  completed: 'check',
  error: 'alert',
  running: 'refresh',
}
const VARIANT_PROGRESS: Record<ProgressState, AlertProps['variant']> = {
  completed: 'success',
  error: 'destructive',
  running: 'default',
}

type ProgressIndicatorProps = {
  children: ReactNode
  state?: ProgressState
}
export function ProgressIndicator({
  children,
  state = 'completed',
}: ProgressIndicatorProps) {
  const running = state === 'running'
  const variant = VARIANT_PROGRESS[state]
  return (
    <AlertRoot variant={variant}>
      <div className='flex flex-row items-center gap-x-2'>
        <Icon
          name={ICON_NAME[state]}
          className={cn({ 'animate-spin': running })}
        />
        <div>{children}</div>
      </div>
    </AlertRoot>
  )
}
