'use client'

import { useMemo } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { useTrace } from '$/stores/traces'
import { SpanType, SpanWithDetails } from '@latitude-data/constants'
import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { MessageList } from '$/components/ChatWrapper'
import { adaptCompletionSpanMessagesToLegacy } from '@latitude-data/core/services/tracing/spans/fetching/findCompletionSpanFromTrace'
import { findFirstSpanOfType } from '@latitude-data/core/services/tracing/spans/fetching/findFirstSpanOfType'

type Props = {
  traceId: string
  onContinue: () => void
}

export function Step6_FirstTrace({ traceId, onContinue }: Props) {
  const { data: trace, isLoading } = useTrace({ traceId })

  const promptSpan = useMemo(() => {
    if (!trace?.children) return null
    return findFirstSpanOfType(trace.children, SpanType.Prompt)
  }, [trace])

  const completionSpan = useMemo(() => {
    if (!trace?.children) return null
    return findFirstSpanOfType(trace.children, SpanType.Completion)
  }, [trace])

  const messages = useMemo(() => {
    return adaptCompletionSpanMessagesToLegacy(completionSpan ?? undefined)
  }, [completionSpan])

  if (isLoading) {
    return (
      <div className='flex flex-col min-h-screen bg-background items-center justify-center'>
        <Icon name='loader' size='xlarge' className='animate-spin' />
      </div>
    )
  }

  return (
    <div className='flex flex-col min-h-screen bg-background'>
      <header className='flex items-center justify-between px-6 py-4 border-b border-border'>
        <div className='flex items-center gap-3'>
          <div className='p-2 rounded-full bg-green-100 dark:bg-green-900'>
            <Icon name='check' color='success' />
          </div>
          <div className='flex flex-col'>
            <Text.H3M color='foreground'>Latitude is working</Text.H3M>
            <Text.H5 color='foregroundMuted'>
              This is a real model request from your app.
            </Text.H5>
          </div>
        </div>
        <Button
          variant='default'
          fancy
          onClick={onContinue}
          iconProps={{ name: 'arrowRight', placement: 'right' }}
        >
          Continue
        </Button>
      </header>

      <main className='flex-1 overflow-auto flex flex-col items-center'>
        <div className='flex flex-col gap-6 max-w-3xl w-full p-6'>
          {promptSpan && (
            <div className='flex flex-col gap-4 p-4 rounded-lg border border-border bg-backgroundCode'>
              <Text.H4M color='foreground'>Trace Details</Text.H4M>
              <DetailsPanel
                span={promptSpan as SpanWithDetails<SpanType>}
                hideMetadataWarning
              />
            </div>
          )}

          {messages.length > 0 && (
            <div className='flex flex-col gap-4 p-4 rounded-lg border border-border'>
              <Text.H4M color='foreground'>Messages</Text.H4M>
              <MessageList debugMode messages={messages} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

