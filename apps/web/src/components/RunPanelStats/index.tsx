import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { formatCount } from '@latitude-data/constants/formatCount'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function RunPanelStats({
  tokens,
  cost,
  duration,
  error,
  isWaiting,
  isRunning,
  abortRun,
  isAbortingRun,
  canAbortRun,
  runAborted,
}: {
  tokens: number
  cost: number
  duration: number
  error?: string
  isWaiting?: boolean
  isRunning: boolean
  abortRun?: () => void
  isAbortingRun?: boolean
  canAbortRun?: boolean
  runAborted?: boolean
}) {
  return (
    <div className='w-full grid grid-cols-[1fr_1fr_2fr] gap-4'>
      <div className='flex-1 min-w-0 flex flex-col items-start justify-between gap-1 border border-border rounded-xl pt-4 pb-3 px-5'>
        <Text.H6M color='foregroundMuted'>Cost</Text.H6M>
        <Text.H4B>{formatCostInMillicents(cost)}</Text.H4B>
      </div>
      <div className='flex-1 min-w-0 flex flex-col items-start justify-between gap-1 border border-border rounded-xl pt-4 pb-3 px-5'>
        <Text.H6M color='foregroundMuted'>Tokens</Text.H6M>
        <Text.H3B>{formatCount(tokens)}</Text.H3B>
      </div>
      <div className='flex-2 min-w-0 flex flex-row items-center justify-between gap-8 border border-border rounded-xl pt-4 pb-3 px-5'>
        <div className='flex flex-col items-start justify-between gap-1'>
          <Text.H6M color='foregroundMuted'>Time elapsed</Text.H6M>
          <Text.H3B>{formatDuration(duration, false)}</Text.H3B>
        </div>
        <div className='h-full flex items-center justify-center -mt-1'>
          {isRunning && canAbortRun && abortRun && (
            <Button
              variant='outlineDestructive'
              fancy={true}
              iconProps={
                isAbortingRun
                  ? { name: 'loader', spin: true, placement: 'left' }
                  : undefined
              }
              onClick={(event) => {
                event.stopPropagation()
                if (isAbortingRun) return
                abortRun()
              }}
              isLoading={isAbortingRun}
              disabled={isAbortingRun}
              userSelect={false}
            >
              <Text.H6M color='destructive'>Stop run</Text.H6M>
            </Button>
          )}
          {!isRunning &&
            (isWaiting ? (
              <Badge variant='muted'>Waiting</Badge>
            ) : runAborted || error ? (
              <Badge variant='destructiveMuted'>Error</Badge>
            ) : (
              <Badge variant='successMuted'>Finished</Badge>
            ))}
        </div>
      </div>
    </div>
  )
}
