'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { relativeTime } from '$/lib/relativeTime'
import { useActiveRuns } from '$/stores/runs/activeRuns'
import { Run } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { memo } from 'react'

export const RunsListItem = memo(
  ({
    run,
    isSelected,
    setSelectedRunUuid,
    timerNow,
    stopRun,
    isStoppingRun,
  }: {
    run: Run
    isSelected: boolean
    setSelectedRunUuid: (uuid?: string) => void
    timerNow?: number
    stopRun?: ReturnType<typeof useActiveRuns>['stopRun']
    isStoppingRun?: boolean
  }) => {
    return (
      <div
        className={cn(
          'w-full flex items-center justify-between gap-3 py-3 px-4',
          'bg-background hover:bg-secondary transition-colors',
          'cursor-pointer group relative',
          { 'bg-secondary': isSelected },
        )}
        onClick={() => {
          if (isSelected) setSelectedRunUuid(undefined)
          else setSelectedRunUuid(run.uuid)
        }}
      >
        <div className='min-w-0 min-h-7 flex items-center justify-start gap-2.5 truncate'>
          {run.endedAt ? (
            <Icon
              name={run.log?.error.code ? 'circleX' : 'circleCheck'}
              size='normal'
              color={run.log?.error.code ? 'destructive' : 'success'}
              className='flex-shrink-0'
            />
          ) : run.startedAt ? (
            <Icon
              name='loader'
              size='normal'
              color='foregroundMuted'
              className='flex-shrink-0 animate-spin'
            />
          ) : (
            <Icon
              name='circleDashed'
              size='normal'
              color='foregroundMuted'
              className='flex-shrink-0 stroke-[2.25]'
            />
          )}
          <Text.H5
            color={run.log?.error.code ? 'destructive' : 'foreground'}
            animate={!run.endedAt}
            userSelect={false}
            noWrap
            ellipsis
          >
            {run.endedAt
              ? run.log?.error.code
                ? (run.log?.error.message ??
                  'An unknown error occurred while running the prompt')
                : (run.caption ??
                  'Run finished successfully without any response')
              : run.startedAt
                ? (run.caption ?? 'Waiting for a response...')
                : 'Waiting to get started...'}
          </Text.H5>
        </div>
        <div className='flex items-center justify-start gap-2'>
          {!!run.startedAt && (
            <Text.H5
              color={run.log?.error.code ? 'destructive' : 'foregroundMuted'}
              userSelect={false}
              noWrap
              ellipsis
            >
              {run.endedAt
                ? relativeTime(new Date(run.endedAt))
                : !!timerNow &&
                  formatDuration(
                    timerNow - new Date(run.startedAt).getTime(),
                    false,
                  )}
            </Text.H5>
          )}
          {!!run.startedAt && !run.endedAt && stopRun && (
            <Button
              variant='destructiveMuted'
              size='none'
              iconProps={
                isStoppingRun
                  ? { name: 'loader', spin: true, placement: 'left' }
                  : undefined
              }
              onClick={(event) => {
                event.stopPropagation()
                if (isStoppingRun) return
                stopRun({ runUuid: run.uuid })
              }}
              isLoading={isStoppingRun}
              disabled={isStoppingRun}
              className='hidden group-hover:block px-2 py-0.5'
            >
              <Text.H5M
                color='destructiveMutedForeground'
                userSelect={false}
                noWrap
                ellipsis
              >
                {isStoppingRun ? 'Stopping' : 'Stop run'}
              </Text.H5M>
            </Button>
          )}
          <Icon
            name='arrowRight'
            size='normal'
            color={run.log?.error.code ? 'destructive' : 'foreground'}
            className='flex-shrink-0'
          />
        </div>
      </div>
    )
  },
)
