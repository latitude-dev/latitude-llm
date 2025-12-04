export * from './AreaChart'
export * from './BarChart'
export * from './PanelChart'
export * from './ScatterChart'
export * from './types'
import { ReactNode } from 'react'
import { cn } from '../../../lib/utils'
import { Icon } from '../../atoms/Icons'
import { Skeleton } from '../../atoms/Skeleton'
import { Text } from '../../atoms/Text'
import { Tooltip } from '../../atoms/Tooltip'

export function ChartWrapper({
  label,
  tooltip,
  loading,
  error,
  children,
  className,
}: {
  label?: string
  tooltip?: string | ReactNode
  loading?: boolean
  error?: Error
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'h-full w-full flex-1 flex flex-col gap-2 p-4 border rounded-xl',
        className,
        {
          'border-border': !error,
          'border-destructive': !!error,
          'bg-destructive/50': !!error,
        },
      )}
    >
      {label && (
        <span className='flex flex-row items-center gap-2'>
          <Text.H5 color={error ? 'destructiveForeground' : 'foregroundMuted'}>
            {label}
          </Text.H5>
          {tooltip && (
            <Tooltip
              asChild
              trigger={
                <span>
                  <Icon name='info' color='foregroundMuted' />
                </span>
              }
              maxWidth='max-w-[400px]'
              align='center'
              side='top'
            >
              {tooltip}
            </Tooltip>
          )}
        </span>
      )}
      {loading && (
        <Skeleton className='min-h-10 h-full w-full bg-muted animate-pulse' />
      )}
      {error && (
        <>
          <Text.H5B color='destructiveForeground'>{error.name}</Text.H5B>
          <Text.H6 color='destructiveForeground'>{error.message}</Text.H6>
        </>
      )}
      {!loading && !error && children}
    </div>
  )
}
