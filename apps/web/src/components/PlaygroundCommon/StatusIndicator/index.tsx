import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import type { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { formatCount } from '$/lib/formatCount'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { estimateCost } from '@latitude-data/core/services/ai/estimateCost/index'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import type { LanguageModelUsage } from 'ai'
import { useMemo } from 'react'

type StatusIndicatorProps = {
  playground: ReturnType<typeof usePlaygroundChat>
  resetChat: () => void
  stopStreaming?: () => void
  canStopStreaming?: boolean
  streamAborted?: boolean
  canChat?: boolean
}

export function StatusIndicator({ playground, canChat = true, ...rest }: StatusIndicatorProps) {
  const { data: providers } = useProviderApiKeys()
  const cost = useMemo(() => {
    const provider = providers?.find((provider) => provider.name === playground.provider)
    const model = playground.model || provider?.defaultModel
    if (!provider || !model) return undefined
    return Math.ceil(
      estimateCost({
        usage: playground.usage,
        provider: provider.provider,
        model: model,
      }) * 100_000,
    )
  }, [providers, playground.provider, playground.model, playground.usage])

  return (
    <div
      className={cn(
        'absolute bg-background rounded-xl flex items-center justify-center flex-row',
        'gap-2 border border-border px-3 py-2 shadow-sm -top-14 !select-none',
        { '-top-[5.5rem]': !canChat },
      )}
    >
      {playground.isLoading && (
        <Icon name='loader' color='foregroundMuted' className='animate-spin' />
      )}
      {!!playground.duration && (
        <StatusInfo usage={playground.usage} cost={cost} duration={playground.duration} />
      )}
      <InnerIndicator playground={playground} {...rest} />
    </div>
  )
}

function InnerIndicator({
  playground: {
    wakingUpIntegration,
    runningLatitudeTools,
    isLoading: isStreaming,
    error: streamError,
  },
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
          Waking up <Text.H6B color='primary'>{wakingUpIntegration}</Text.H6B> integration
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

  if (isStreaming && canStopStreaming && stopStreaming) {
    return (
      <>
        <Separator orientation='vertical' className='self-stretch h-auto' />
        <Button variant='ghost' size='none' onClick={stopStreaming}>
          <Text.H6M color='destructive'>Stop run</Text.H6M>
        </Button>
      </>
    )
  }

  if (!isStreaming) {
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
                <Text.H6M color='destructive'>New chat</Text.H6M>
              </Button>
            }
          >
            {streamError?.message || 'Run cancelled'}
          </Tooltip>
        ) : (
          <Button variant='ghost' size='none' onClick={resetChat}>
            <Text.H6M color='primary'>New chat</Text.H6M>
          </Button>
        )}
      </>
    )
  }

  return null
}

function StatusInfo({
  usage: { promptTokens, completionTokens, totalTokens },
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
          <Text.H6M color='foregroundMuted'>{formatDuration(duration, false)}</Text.H6M>
          <Separator orientation='vertical' className='self-stretch h-auto' />
          <Text.H6M color='foregroundMuted' centered>
            {formatCount(totalTokens || promptTokens || completionTokens || 0)} tokens
          </Text.H6M>
        </span>
      }
    >
      <div className='flex flex-col justify-between'>
        <div className='flex flex-col justify-between gap-y-2 divide-y divider-background'>
          <div className='w-full flex flex-col'>
            <StatusInfoItem label='Prompt' value={promptTokens} />
            <StatusInfoItem label='Cached' />
            <StatusInfoItem label='Reasoning' />
            <StatusInfoItem label='Completion' value={completionTokens} />
          </div>
          <div className='pt-2'>
            <StatusInfoItem label='Tokens' value={totalTokens} />
            {cost !== undefined && (
              <StatusInfoItem label='Cost' value={formatCostInMillicents(cost)} />
            )}
            <StatusInfoItem label='Duration' value={formatDuration(duration)} />
            <StatusInfoItem
              label='Tok/Sec'
              value={formatCount(Math.ceil(completionTokens / (duration / 1000)))}
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

function StatusInfoItem({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className='w-full flex flex-row justify-between items-center gap-4'>
      <Text.H6B color='background'>{label}</Text.H6B>
      <Text.H6 color='background'>{value ?? '-'}</Text.H6>
    </div>
  )
}
