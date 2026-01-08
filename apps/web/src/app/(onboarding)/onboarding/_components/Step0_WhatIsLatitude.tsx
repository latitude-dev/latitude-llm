'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { OnboardingLayout } from './OnboardingLayout'

type Props = {
  onContinue: () => void
}

export function Step0_WhatIsLatitude({ onContinue }: Props) {
  return (
    <OnboardingLayout hideHeader>
      <div className='flex flex-col items-center gap-10 max-w-2xl text-center'>
        <div className='relative'>
          <Icon name='logo' size='xxxlarge' />
        </div>

        <div className='flex flex-col items-center gap-4 text-center'>
          <Text.H1B color='foreground' centered>
            A clear path to reliable AI in production
          </Text.H1B>
          <div className='flex flex-col items-center gap-4 max-w-lg'>
            <Text.H4 color='foregroundMuted' centered>
              Latitude helps you find where prompts fail, turn those failures
              into evals, and automatically optimize your prompts using real
              production data.
            </Text.H4>
          </div>
        </div>

        <Button variant='default' fancy onClick={onContinue}>
          Get started
        </Button>
      </div>
    </OnboardingLayout>
  )
}
