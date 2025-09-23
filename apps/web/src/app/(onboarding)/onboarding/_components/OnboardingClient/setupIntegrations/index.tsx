import { useCallback } from 'react'
import { OnboardingStep } from '../../../constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'

export function SetupIntegrationsStep({
  setCurrentStep,
}: {
  setCurrentStep: (step: OnboardingStep) => void
}) {
  const handleNext = useCallback(() => {
    setCurrentStep(OnboardingStep.ConfigureTriggers)
  }, [setCurrentStep])

  return (
    <div className='flex flex-col h-full items-center p-32 gap-10'>
      <div className='flex flex-col items-center gap-2'>
        <div className='p-2 border-2 rounded-lg'>
          <Icon className='' name='sendToBack' size='xlarge' />
        </div>
        <Text.H2B color='foreground' noWrap>
          Set up 2 integrations
        </Text.H2B>
        <Text.H5 color='foregroundMuted'>
          Integrations allow your agent to connect to other apps
        </Text.H5>
      </div>
      <div className='flex flex-col items-center gap-2 border-dashed border-2 rounded-xl p-2'>
        Text will go in here!
      </div>
      <Button fancy onClick={handleNext}>
        Next
      </Button>
    </div>
  )
}
