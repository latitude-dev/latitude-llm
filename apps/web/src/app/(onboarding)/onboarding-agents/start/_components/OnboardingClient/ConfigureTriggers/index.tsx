import { Fragment, useCallback, useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import useDocumentTriggers from '$/stores/documentTriggers'
import useIntegrations from '$/stores/integrations'
import { UnconfiguredTriggers } from './_components/UnconfiguredTriggers'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import {
  DocumentTriggerStatus,
  DocumentTriggerType,
} from '@latitude-data/constants'
import { ConfiguredTriggers } from './_components/ConfiguredTriggers'
import { IsLoadingOnboardingItem } from '../../../lib/IsLoadingOnboardingItem'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { OnboardingStep } from '../../../../../_lib/OnboardingStep'

export function ConfigureTriggersHeader() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { data: triggers } = useDocumentTriggers({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  const sortedIntegrationTriggersByPendingFirst = useMemo(() => {
    return triggers
      .filter(
        (trigger) => trigger.triggerType === DocumentTriggerType.Integration,
      )
      .sort((a) => {
        return a.triggerStatus === DocumentTriggerStatus.Pending ? -1 : 1
      })
  }, [triggers])

  const allUnconfiguredTriggers = useMemo(() => {
    return sortedIntegrationTriggersByPendingFirst.filter(
      (trigger) => trigger.triggerStatus === DocumentTriggerStatus.Pending,
    )
  }, [sortedIntegrationTriggersByPendingFirst])

  const allTriggersConfigured = useMemo(() => {
    return allUnconfiguredTriggers.length === 0
  }, [allUnconfiguredTriggers])

  return (
    <OnboardingStep.Header>
      <div className='p-2 border-2 rounded-lg'>
        <Icon className='' name='wrench' size='medium' />
      </div>
      {!allTriggersConfigured ? (
        <>
          <Text.H2M color='foreground' noWrap>
            Configure{' '}
            <Text.H2M color='foregroundMuted'>
              {allUnconfiguredTriggers.length}
            </Text.H2M>{' '}
            agent triggers
          </Text.H2M>
          <Text.H5 color='foregroundMuted'>
            Some triggers may require additional configuration
          </Text.H5>
        </>
      ) : (
        <>
          <Text.H2M color='foreground' noWrap>
            All triggers configured!
          </Text.H2M>
          <Text.H5 color='foregroundMuted'>
            You can proceed to the next step
          </Text.H5>
        </>
      )}
    </OnboardingStep.Header>
  )
}

export function ConfigureTriggersBody({
  moveNextOnboardingStep,
}: {
  moveNextOnboardingStep: ({
    currentStep,
  }: {
    currentStep: OnboardingStepKey
  }) => void
}) {
  const handleNext = useCallback(() => {
    moveNextOnboardingStep({ currentStep: OnboardingStepKey.ConfigureTriggers })
  }, [moveNextOnboardingStep])

  const { data: integrations, isLoading: isLoadingIntegrations } =
    useIntegrations()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { data: triggers, isLoading: isLoadingTriggers } = useDocumentTriggers({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  const sortedIntegrationTriggersByPendingFirst = useMemo(() => {
    return triggers
      .filter(
        (trigger) => trigger.triggerType === DocumentTriggerType.Integration,
      )
      .sort((a) => {
        return a.triggerStatus === DocumentTriggerStatus.Pending ? -1 : 1
      })
  }, [triggers])

  const allUnconfiguredTriggers = useMemo(() => {
    return sortedIntegrationTriggersByPendingFirst.filter(
      (trigger) => trigger.triggerStatus === DocumentTriggerStatus.Pending,
    )
  }, [sortedIntegrationTriggersByPendingFirst])

  const allTriggersConfigured = useMemo(() => {
    return allUnconfiguredTriggers.length === 0
  }, [allUnconfiguredTriggers])

  return (
    <OnboardingStep.Body>
      <div className='flex flex-col items-center gap-2 border-dashed border-2 rounded-xl p-2 w-full max-w-[600px]'>
        {isLoadingTriggers || isLoadingIntegrations ? (
          <IsLoadingOnboardingItem
            highlightedText='Triggers'
            nonHighlightedText='will appear in a moment...'
          />
        ) : (
          sortedIntegrationTriggersByPendingFirst.map((trigger) => (
            <Fragment key={trigger.uuid}>
              {trigger.triggerStatus === DocumentTriggerStatus.Pending && (
                <UnconfiguredTriggers
                  trigger={trigger}
                  integrations={integrations}
                />
              )}
              {trigger.triggerStatus === DocumentTriggerStatus.Deployed && (
                <ConfiguredTriggers
                  trigger={trigger}
                  integrations={integrations}
                />
              )}
            </Fragment>
          ))
        )}
      </div>
      <Button
        fancy
        onClick={handleNext}
        iconProps={{ name: 'chevronRight', placement: 'right' }}
        disabled={!allTriggersConfigured}
      >
        Next
      </Button>
    </OnboardingStep.Body>
  )
}
