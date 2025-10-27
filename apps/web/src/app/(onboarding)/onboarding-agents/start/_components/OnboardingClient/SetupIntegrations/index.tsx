import { useCallback, useMemo } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import useIntegrations from '$/stores/integrations'
import {
  getPipedreamUnconfiguredIntegrations,
  UnconfiguredIntegrations,
} from '$/components/Integrations/UnconfiguredIntegrations'
import { ConfiguredIntegrations } from '$/components/Integrations/ConfiguredIntegrations'
import { IsLoadingOnboardingItem } from '../../../lib/IsLoadingOnboardingItem'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { OnboardingStep } from '../../../../../_lib/OnboardingStep'

export function SetupIntegrationsHeader() {
  const { data: integrations } = useIntegrations()

  const allIntegrationsConfigured = useMemo(() => {
    return getPipedreamUnconfiguredIntegrations(integrations).length === 0
  }, [integrations])

  return (
    <OnboardingStep.Header>
      <div className='p-2 border-2 rounded-lg'>
        <Icon className='' name='sendToBack' size='medium' />
      </div>
      {!allIntegrationsConfigured ? (
        <>
          <Text.H2M color='foreground' noWrap>
            Set up{' '}
            <Text.H2M color='foregroundMuted'>
              {getPipedreamUnconfiguredIntegrations(integrations).length}
            </Text.H2M>{' '}
            integrations
          </Text.H2M>
          <Text.H5 color='foregroundMuted'>
            Integrations allow your agent to connect to other apps
          </Text.H5>
        </>
      ) : (
        <>
          <Text.H2M color='foreground' noWrap>
            All integrations configured!
          </Text.H2M>
          <Text.H5 color='foregroundMuted'>
            You can proceed to the next step
          </Text.H5>
        </>
      )}
    </OnboardingStep.Header>
  )
}

export function SetupIntegrationsBody({
  moveNextOnboardingStep,
}: {
  moveNextOnboardingStep: ({
    currentStep,
  }: {
    currentStep: OnboardingStepKey
  }) => void
}) {
  const handleNext = useCallback(() => {
    moveNextOnboardingStep({ currentStep: OnboardingStepKey.SetupIntegrations })
  }, [moveNextOnboardingStep])

  const { data: integrations, isLoading: isLoadingIntegrations } =
    useIntegrations()

  const allIntegrationsConfigured = useMemo(() => {
    return getPipedreamUnconfiguredIntegrations(integrations).length === 0
  }, [integrations])

  return (
    <OnboardingStep.Body>
      <div className='flex flex-col items-center gap-2 border-dashed border-2 rounded-xl p-2 w-full max-w-[500px]'>
        {isLoadingIntegrations ? (
          <IsLoadingOnboardingItem
            highlightedText='Integrations'
            nonHighlightedText='will appear in a moment...'
          />
        ) : (
          <>
            <UnconfiguredIntegrations />
            <ConfiguredIntegrations integrations={integrations} />
          </>
        )}
      </div>
      <Button
        fancy
        onClick={handleNext}
        iconProps={{ name: 'chevronRight', placement: 'right' }}
        disabled={!allIntegrationsConfigured}
      >
        Next
      </Button>
    </OnboardingStep.Body>
  )
}
