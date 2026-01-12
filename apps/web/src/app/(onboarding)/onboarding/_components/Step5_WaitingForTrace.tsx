'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { OnboardingLayout } from './OnboardingLayout'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'

const SKIP_TIMEOUT_MS = 10000

type Props = {
  onTraceReceived: (traceId: string) => void
  onBack: () => void
  onSkip: () => void
}

export function Step5_WaitingForTrace({
  onTraceReceived,
  onBack,
  onSkip,
}: Props) {
  const [showSkip, setShowSkip] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowSkip(true)
    }, SKIP_TIMEOUT_MS)

    return () => clearTimeout(timeout)
  }, [])

  const onSpanCreated = useCallback(
    (args: EventArgs<'spanCreated'>) => {
      if (!args) return
      if (args.span.traceId) {
        onTraceReceived(args.span.traceId)
      }
    },
    [onTraceReceived],
  )

  useSockets({ event: 'spanCreated', onMessage: onSpanCreated })

  return (
    <OnboardingLayout>
      <div className='flex flex-col items-center gap-8 max-w-xl text-center'>
        <div className='flex flex-col items-center gap-4'>
          <Icon name='loader' size='xlarge' className='animate-spin' />
          <Text.H2M color='foreground'>
            Waiting for your first request…
          </Text.H2M>
          <Text.H4 color='foregroundMuted'>
            Make one model call from your app. Any input works.
          </Text.H4>
        </div>

        <div className='flex flex-col items-center gap-3'>
          <Button
            variant='outline'
            fancy
            onClick={onBack}
            iconProps={{ name: 'chevronLeft', placement: 'left' }}
          >
            Back to integration
          </Button>

          {showSkip && (
            <Button variant='ghost' onClick={onSkip}>
              Continue without waiting →
            </Button>
          )}
        </div>
      </div>
    </OnboardingLayout>
  )
}
