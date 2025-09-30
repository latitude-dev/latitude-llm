import { useCallback, useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import useDocumentTriggers from '$/stores/documentTriggers'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import {
  DocumentTriggerStatus,
  DocumentTriggerType,
} from '@latitude-data/constants'

export function TriggerAgentStep({
  moveNextOnboardingStep,
}: {
  moveNextOnboardingStep: () => void
}) {
  const handleNext = useCallback(() => {
    moveNextOnboardingStep()
  }, [moveNextOnboardingStep])

  const project = useCurrentProject()
  const commit = useCurrentCommit()

  const { data: triggers } = useDocumentTriggers({
    projectId: project.project.id,
    commitUuid: commit.commit.uuid,
  })

  const sortedIntegrationTriggersByPendingFirst = useMemo(() => {
    return triggers
      .filter(
        (trigger) => trigger.triggerType === DocumentTriggerType.Integration,
      )
      .sort((a) => {
        return a.triggerStatus === DocumentTriggerStatus.Deployed ? 1 : -1
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
    <div className='flex flex-col h-full items-center p-32 gap-10'>
      <div className='flex flex-col items-center gap-2'>
        <div className='p-2 border-2 rounded-lg'>
          <Icon className='' name='mousePointerClick' size='medium' />
        </div>
        <Text.H2M color='foreground' noWrap>
          Trigger the agent
        </Text.H2M>
        <Text.H5 color='foregroundMuted'>
          Perform one of the below actions to trigger and run the agent
        </Text.H5>
      </div>
      <div className='flex flex-col items-center gap-2 border-dashed border-2 rounded-xl p-2 w-full max-w-[600px]'></div>
      <Button
        fancy
        onClick={handleNext}
        iconProps={{ name: 'chevronRight', placement: 'right' }}
        disabled={!allTriggersConfigured}
      >
        Next
      </Button>
    </div>
  )
}
