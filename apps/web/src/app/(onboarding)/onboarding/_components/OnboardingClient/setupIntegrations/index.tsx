import { useCallback, useMemo } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import useIntegrations from '$/stores/integrations'
import {
  getPipedreamUnconfiguredIntegrations,
  UnconfiguredIntegrations,
} from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/UnconfiguredIntegrations'
import { ConfiguredIntegrations } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/ConfiguredIntegrations'

export function SetupIntegrationsStep({
  moveNextOnboardingStep,
}: {
  moveNextOnboardingStep: () => void
}) {
  const handleNext = useCallback(() => {
    moveNextOnboardingStep()
  }, [moveNextOnboardingStep])

  const { data: integrations } = useIntegrations()

  const allIntegrationsConfigured = useMemo(() => {
    return getPipedreamUnconfiguredIntegrations(integrations).length === 0
  }, [integrations])

  return (
    <div className='flex flex-col h-full items-center p-32 gap-10'>
      <div className='flex flex-col items-center gap-2'>
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
      </div>
      <div className='flex flex-col items-center gap-2 border-dashed border-2 rounded-xl p-2'>
        <UnconfiguredIntegrations />
        <ConfiguredIntegrations integrations={integrations} />
      </div>
      <Button
        fancy
        onClick={handleNext}
        iconProps={{ name: 'chevronRight', placement: 'right' }}
        disabled={!allIntegrationsConfigured}
      >
        Next
      </Button>
    </div>
  )
}
