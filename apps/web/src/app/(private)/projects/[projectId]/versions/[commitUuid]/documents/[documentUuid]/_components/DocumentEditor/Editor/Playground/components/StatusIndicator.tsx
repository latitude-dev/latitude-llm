import { LanguageModelUsage } from 'ai'
import { AnimatedDots } from '@latitude-data/web-ui/molecules/AnimatedDots'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

import { FloatingElement } from './FloatingElement'
import { TokenUsage } from './TokenUsage'

export function StatusIndicator({
  usage,
  isScrolledToBottom,
  wakingUpIntegration,
  runningLatitudeTools = 0,
  isStreaming = false,
  stopStreaming,
  canStopStreaming = false,
}: {
  usage: LanguageModelUsage | undefined
  isScrolledToBottom: boolean
  wakingUpIntegration?: string
  runningLatitudeTools?: number
  isStreaming: boolean
  stopStreaming?: () => void
  canStopStreaming?: boolean
}) {
  const floatingProps = { isScrolledToBottom: false }
  if (wakingUpIntegration) {
    return (
      <FloatingElement {...floatingProps}>
        <div className='flex flex-row gap-2 p-1'>
          <Icon
            name='loader'
            color='foregroundMuted'
            className='animate-spin'
          />
          <Text.H6 color='foregroundMuted'>
            Waking up <Text.H6B color='primary'>{wakingUpIntegration}</Text.H6B>{' '}
            integration...
          </Text.H6>
        </div>
      </FloatingElement>
    )
  }

  if (runningLatitudeTools > 0) {
    return (
      <FloatingElement {...floatingProps}>
        <div className='flex flex-row gap-2 p-1'>
          <Icon
            name='loader'
            color='foregroundMuted'
            className='animate-spin'
          />
          <Text.H6 color='foregroundMuted'>
            Running <Text.H6B color='primary'>{runningLatitudeTools}</Text.H6B>{' '}
            {runningLatitudeTools === 1 ? 'tool' : 'tools'}...
          </Text.H6>
        </div>
      </FloatingElement>
    )
  }

  if (isStreaming) {
    return (
      <FloatingElement {...floatingProps}>
        <div className='flex flex-row gap-1 p-1'>
          <AnimatedDots color='success' />
          {canStopStreaming && stopStreaming && (
            <Tooltip
              side='top'
              align='center'
              sideOffset={5}
              delayDuration={250}
              asChild
              trigger={
                <button
                  type='button'
                  aria-label='Stop streaming'
                  className='flex items-center justify-center p-1 rounded-full bg-muted hover:bg-muted-hover transition-colors'
                  onClick={stopStreaming}
                >
                  <Icon name='pause' color='foregroundMuted' />
                </button>
              }
            >
              Stop streaming
            </Tooltip>
          )}
        </div>
      </FloatingElement>
    )
  }

  return (
    <FloatingElement
      isScrolledToBottom={isScrolledToBottom}
    >
      <div className='p-2'>
        <TokenUsage usage={usage} />
      </div>
    </FloatingElement>
  )
}
