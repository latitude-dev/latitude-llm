import { ReactNode } from 'react'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'

type MetadataItemProps = {
  stacked?: boolean
  label: string
  tooltip?: string
  action?: ReactNode
  value?: string
  color?: TextColor
  loading?: boolean
  children?: ReactNode
}
export function MetadataItem({
  label,
  tooltip,
  action,
  stacked = false,
  value,
  color = 'foregroundMuted',
  loading,
  children,
}: MetadataItemProps) {
  const className = stacked
    ? 'flex-flex-col gap-2'
    : 'flex flex-row justify-between items-center gap-2'
  return (
    <div className={className}>
      <span className='flex flex-row items-center justify-between gap-4'>
        <span className='flex flex-row items-center gap-2'>
          <Text.H5M color='foreground'>{label}</Text.H5M>
          {tooltip && (
            <Tooltip
              asChild
              trigger={
                <span>
                  <Icon name='info' color='foreground' />
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
        {stacked && action}
      </span>
      <div>
        {loading ? (
          <Skeleton height='h4' className='w-12' />
        ) : (
          <>
            {value && (
              <Text.H5 align='right' color={color}>
                {value}
              </Text.H5>
            )}
            {children}
          </>
        )}
      </div>
    </div>
  )
}

type MetadataItemWithTooltipProps = MetadataItemProps & {
  trigger: ReactNode
  tooltipContent: string | ReactNode
}

export function MetadataItemTooltip({
  tooltipContent,
  trigger,
  ...rest
}: MetadataItemWithTooltipProps) {
  return (
    <MetadataItem {...rest}>
      <Tooltip
        side='top'
        align='end'
        delayDuration={250}
        trigger={
          <div className='flex flex-row items-center gap-x-1'>
            {trigger}
            <Icon name='info' className='text-muted-foreground' />
          </div>
        }
      >
        {typeof tooltipContent === 'string' ? (
          tooltipContent
        ) : (
          <div className='flex flex-col justify-between'>{tooltipContent}</div>
        )}
      </Tooltip>
    </MetadataItem>
  )
}
