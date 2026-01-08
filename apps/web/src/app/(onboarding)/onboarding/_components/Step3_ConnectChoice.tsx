'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { OnboardingLayout } from './OnboardingLayout'

type Props = {
  onIntegrate: () => void
  onSkip: () => void
  onBack: () => void
  isSkipping: boolean
}

export function Step3_ConnectChoice({
  onIntegrate,
  onSkip,
  onBack,
  isSkipping,
}: Props) {
  return (
    <OnboardingLayout hideHeader>
      <div className='flex flex-col items-center gap-10 max-w-2xl text-center'>
        <div className='relative'>
          <Icon name='logo' size='xxxlarge' />
        </div>

        <div className='flex flex-col items-center gap-4 text-center'>
          <Text.H1B color='foreground' centered>
            Connect your AI app
          </Text.H1B>
          <div className='flex flex-col items-center gap-4 max-w-lg'>
            <Text.H4 color='foregroundMuted' centered>
              To start the reliability loop, Latitude needs real traces from a
              live AI app.
            </Text.H4>
          </div>
        </div>

        <div className='flex flex-col items-center gap-3'>
          <Button variant='default' fancy onClick={onIntegrate}>
            Integrate with an existing AI app
          </Button>
          <Button
            variant='outline'
            fancy
            onClick={onBack}
            iconProps={{ name: 'refresh', placement: 'left' }}
          >
            Rewatch tour
          </Button>
        </div>

        <Button variant='ghost' onClick={onSkip} disabled={isSkipping}>
          {isSkipping ? 'Continuing...' : "I don't have an AI app"}
        </Button>
      </div>
    </OnboardingLayout>
  )
}

