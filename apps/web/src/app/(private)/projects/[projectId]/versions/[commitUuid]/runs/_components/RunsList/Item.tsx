'use client'

import { memo, useMemo } from 'react'
import { formatDuration } from '$/app/_lib/formatUtils'
import { relativeTime } from '$/lib/relativeTime'
import { EvaluationResultV2, Span } from '@latitude-data/constants'
import { Icon, IconProps } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

export const RunsListItem = memo(
  ({
    span,
    isSelected,
    setSelectedSpanId,
    timerNow,
    annotation,
  }: {
    span: Span
    isSelected: boolean
    setSelectedSpanId: (id?: string) => void
    timerNow?: number
    annotation?: EvaluationResultV2
  }) => {
    const iconProps = useMemo<IconProps>(() => {
      if (span.status === 'error') {
        return { name: 'circleX', color: 'destructive' }
      }

      const started = !!span.startedAt
      const ended = !!span.endedAt
      if (!started && !ended) {
        return {
          name: 'circleDashed',
          color: 'foregroundMuted',
          className: 'stroke-[2.25]',
        }
      }
      if (started && !ended) {
        return { name: 'loader', color: 'foregroundMuted', spin: true }
      }

      if (annotation) return { name: 'circleCheck', color: 'success' }

      return { name: 'circleDashed', color: 'foregroundMuted' }
    }, [span, annotation])

    return (
      <div
        className={cn(
          'w-full flex items-center justify-between gap-3 py-3 px-4',
          'bg-background hover:bg-secondary transition-colors',
          'cursor-pointer group relative',
          { 'bg-secondary': isSelected },
        )}
        onClick={() => {
          if (isSelected) setSelectedSpanId(undefined)
          else setSelectedSpanId(span.id)
        }}
      >
        <div className='min-w-0 min-h-8 flex items-center justify-start gap-2.5 truncate'>
          <Icon
            size='normal'
            name={iconProps.name}
            color={iconProps.color}
            spin={iconProps.spin}
            className={cn('flex-shrink-0', iconProps.className)}
          />
          <Text.H5
            color={span.status === 'error' ? 'destructive' : 'foreground'}
            animate={!span.endedAt}
            userSelect={false}
            noWrap
            ellipsis
          >
            {span.endedAt
              ? span.status === 'error'
                ? span.message ||
                  'An unknown error occurred while running the prompt'
                : span.name || 'Run finished successfully without any response'
              : span.startedAt
                ? span.name || 'Waiting for a response...'
                : 'Waiting to get started...'}
          </Text.H5>
        </div>
        <div className='flex items-center justify-start gap-2'>
          {!!span.startedAt && (
            <Text.H5
              color={
                span.status === 'error' ? 'destructive' : 'foregroundMuted'
              }
              userSelect={false}
              noWrap
              ellipsis
            >
              {span.endedAt
                ? relativeTime(new Date(span.endedAt))
                : !!timerNow &&
                  formatDuration(
                    timerNow - new Date(span.startedAt).getTime(),
                    false,
                  )}
            </Text.H5>
          )}
          <Icon
            name='arrowRight'
            size='normal'
            color={span.status === 'error' ? 'destructive' : 'foreground'}
            className='flex-shrink-0'
          />
        </div>
      </div>
    )
  },
)
