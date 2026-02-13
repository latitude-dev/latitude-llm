import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { formatCount } from '@latitude-data/constants/formatCount'
import { LegacyVercelSDKVersion4Usage as LanguageModelUsage } from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'

type StatusIndicatorProps = {
  playground: ReturnType<typeof usePlaygroundChat>
  resetChat: () => void
  stopStreaming?: () => void
  canStopStreaming?: boolean
  streamAborted?: boolean
  canChat?: boolean
  position?: 'top' | 'bottom'
}

export function StatusIndicator({
  playground,
  canChat = true,
  position = 'top',
  ...rest
}: StatusIndicatorProps) {
  return (
    <div
      className={cn(
        'absolute left-1/2 -translate-x-1/2 bg-background rounded-xl flex items-center justify-center flex-row',
        'gap-2 border border-border px-3 py-2 shadow-sm !select-none',
        position === 'bottom' ? '' : '-top-14',
        { '-top-[5.5rem]': !canChat && position === 'top' },
      )}
    >
      {playground.isLoading && (
        <Icon name='loader' color='foregroundMuted' className='animate-spin' />
      )}
      {!!playground.duration && (
        <>
          <StatusInfo
            usage={playground.usage}
            cost={playground.cost}
            duration={playground.duration}
          />
        </>
      )}
      <InnerIndicator playground={playground} canChat={canChat} {...rest} />
    </div>
  )
}

function InnerIndicator({
  playground: {
    wakingUpIntegration,
    runningLatitudeTools,
    isLoading: isStreaming,
    isStopping,
    error: streamError,
  },
  canChat,
  resetChat,
  stopStreaming,
  canStopStreaming = false,
  streamAborted = false,
}: StatusIndicatorProps) {
  if (wakingUpIntegration) {
    return (
      <>
        <Separator orientation='vertical' className='self-stretch h-auto' />
        <Text.H6 color='foregroundMuted'>
          Waking up <Text.H6B color='primary'>{wakingUpIntegration}</Text.H6B>{' '}
          integration
        </Text.H6>
      </>
    )
  }

  if (runningLatitudeTools > 0) {
    return (
      <>
        <Separator orientation='vertical' className='self-stretch h-auto' />
        <Text.H6 color='foregroundMuted'>
          Running <Text.H6B color='primary'>{runningLatitudeTools}</Text.H6B>{' '}
          {runningLatitudeTools === 1 ? 'tool' : 'tools'}
        </Text.H6>
      </>
    )
  }

  if (isStreaming && isStopping) {
    return (
      <>
        <Separator orientation='vertical' className='self-stretch h-auto' />
        <Text.H6M color='destructive' textOpacity={50}>
          Stopping run...
        </Text.H6M>
      </>
    )
  }

  if (isStreaming && canStopStreaming && stopStreaming) {
    return (
      <>
        <Separator orientation='vertical' className='self-stretch h-auto' />
        <Button variant='ghost' size='none' onClick={stopStreaming}>
          <Text.H6M color='destructiveMutedForeground'>Stop run</Text.H6M>
        </Button>
      </>
    )
  }

  if (!isStreaming && canChat) {
    return (
      <>
        <Separator orientation='vertical' className='self-stretch h-auto' />
        {streamAborted || streamError ? (
          <Tooltip
            asChild
            side='right'
            align='center'
            sideOffset={20}
            trigger={
              <Button variant='ghost' size='none' onClick={resetChat}>
                <Text.H6M color='destructiveMutedForeground'>New chat</Text.H6M>
              </Button>
            }
          >
            {streamError?.message || 'Run cancelled'}
          </Tooltip>
        ) : (
          <Button variant='ghost' size='none' onClick={resetChat}>
            <Text.H6M color='accentForeground'>New chat</Text.H6M>
          </Button>
        )}
      </>
    )
  }

  return null
}

function StatusInfo({
  usage: {
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens,
    cachedInputTokens,
  },
  cost,
  duration,
}: {
  usage: LanguageModelUsage
  cost: number | undefined
  duration: number
}) {
  return (
    <Tooltip
      asChild
      side='left'
      align='center'
      sideOffset={20}
      className='!cursor-default'
      trigger={
        <span className='inline-flex items-center justify-center flex-row gap-2 cursor-default'>
          <Text.H6M color='foregroundMuted'>
            {formatDuration(duration, false)}
          </Text.H6M>
          <Separator orientation='vertical' className='self-stretch h-auto' />
          <Text.H6M color='foregroundMuted' centered>
            {formatCount(
              totalTokens ||
                promptTokens ||
                completionTokens ||
                cachedInputTokens ||
                reasoningTokens ||
                0,
            )}{' '}
            tokens
          </Text.H6M>
        </span>
      }
    >
      <div className='flex flex-col justify-between'>
        <div className='flex flex-col justify-between gap-y-2 divide-y divider-background'>
          <div className='w-full flex flex-col'>
            <StatusInfoItem label='Prompt' value={promptTokens} />
            <StatusInfoItem label='Cached' value={cachedInputTokens} />
            <StatusInfoItem label='Reasoning' value={reasoningTokens} />
            <StatusInfoItem label='Completion' value={completionTokens} />
          </div>
          <div className='pt-2'>
            <StatusInfoItem label='Tokens' value={totalTokens} />
            {cost !== undefined && (
              <StatusInfoItem
                label='Cost'
                value={formatCostInMillicents(cost)}
              />
            )}
            <StatusInfoItem label='Duration' value={formatDuration(duration)} />
            <StatusInfoItem
              label='Tok/Sec'
              value={formatCount(
                Math.ceil(completionTokens / (duration / 1000)),
              )}
            />
          </div>
          <div className='pt-2'>
            <Text.H6 color='background' isItalic>
              Estimation, actual
              <br />
              info only in logs.
            </Text.H6>
          </div>
        </div>
      </div>
    </Tooltip>
  )
}

function StatusInfoItem({
  label,
  value,
}: {
  label: string
  value?: number | string
}) {
  return (
    <div className='w-full flex flex-row justify-between items-center gap-4'>
      <Text.H6B color='background'>{label}</Text.H6B>
      <Text.H6 color='background'>{value ?? '-'}</Text.H6>
    </div>
  )
}
