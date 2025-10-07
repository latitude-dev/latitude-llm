import { useCallback, useMemo, useState } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import useDocumentTriggers from '$/stores/documentTriggers'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { DocumentTriggerType } from '@latitude-data/constants'
import { RunTrigger } from './_components/RunTrigger'
import useIntegrations from '$/stores/integrations'
import { ChatTriggerTextarea } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/ChatTriggerTextarea'
import { useActiveChatTrigger } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/useActiveTrigger'
import {
  ActiveTrigger,
  OnRunTriggerFn,
} from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggersList'
import { IsLoadingOnboardingItem } from '../../../lib/IsLoadingOnboardingItem'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { useTriggerSockets } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/useTriggerSockets'
import { OnboardingStep } from '../../../lib/OnboardingStep'
import { usePlayground } from '../../../lib/PlaygroundProvider'

export function TriggerAgentHeader() {
  return (
    <OnboardingStep.Header>
      <div className='p-2 border-2 rounded-lg'>
        <Icon className='' name='mousePointerClick' size='medium' />
      </div>
      <Text.H2M color='foreground' noWrap>
        Trigger the agent
      </Text.H2M>
      <Text.H5 color='foregroundMuted'>
        Perform one of the below actions to trigger and run the agent
      </Text.H5>
    </OnboardingStep.Header>
  )
}

export function TriggerAgentBody({
  moveNextOnboardingStep,
  setActiveTrigger,
}: {
  moveNextOnboardingStep: ({
    currentStep,
  }: {
    currentStep: OnboardingStepKey
  }) => void
  setActiveTrigger: (trigger: ActiveTrigger) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { playground } = usePlayground()

  const {
    data: triggers,
    isLoading: isLoadingTriggers,
    mutate,
  } = useDocumentTriggers({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  useTriggerSockets({ commit: commit, project: project, mutate })

  const activeChatTrigger = useActiveChatTrigger({
    commit: commit,
    project: project,
    triggers,
  })

  const [openChatInput, setOpenChatInput] = useState<boolean>(false)
  const toggleOpenChatInput = useCallback(() => {
    if (openChatInput) {
      setOpenChatInput(false)
    } else {
      setOpenChatInput(true)
    }
  }, [openChatInput])

  const { data: integrations, isLoading: isLoadingIntegrations } =
    useIntegrations()

  const sortedTriggersByIntegrationFirst = useMemo(() => {
    return triggers.sort((a) => {
      return a.triggerType === DocumentTriggerType.Integration ? -1 : 1
    })
  }, [triggers])

  const onRunTrigger: OnRunTriggerFn = useCallback(
    ({ document, parameters, userMessage, aiParameters = false }) => {
      setActiveTrigger({ document, parameters, userMessage })
      playground.start({ document, parameters, userMessage, aiParameters })
      moveNextOnboardingStep({ currentStep: OnboardingStepKey.TriggerAgent })
    },
    [setActiveTrigger, moveNextOnboardingStep, playground],
  )

  return (
    <OnboardingStep.Body>
      <div className='flex flex-col items-center gap-2 border-dashed border-2 rounded-xl p-2 w-full max-w-[500px]'>
        {isLoadingTriggers || isLoadingIntegrations ? (
          <IsLoadingOnboardingItem
            highlightedText='Triggers'
            nonHighlightedText='will appear in a moment...'
          />
        ) : (
          sortedTriggersByIntegrationFirst.map((trigger) => (
            <RunTrigger
              key={trigger.uuid}
              trigger={trigger}
              onRunTrigger={onRunTrigger}
              onRunChatTrigger={toggleOpenChatInput}
              integrations={integrations}
            />
          ))
        )}
      </div>
      <div className='flex flex-col gap-6 w-full max-w-[500px]'>
        {activeChatTrigger.active && openChatInput ? (
          <div className='sticky bottom-6'>
            <ChatTriggerTextarea
              key={activeChatTrigger.activeKey}
              commit={commit}
              project={project}
              document={activeChatTrigger.active.document}
              chatTrigger={activeChatTrigger.active.trigger}
              chatFocused={openChatInput}
              onRunTrigger={onRunTrigger}
              options={activeChatTrigger.options}
              onChange={activeChatTrigger.onChange}
            />
          </div>
        ) : null}
        <div className='flex flex-col gap-2 w-full max-w-[600px]'>
          <Text.H5 centered color='foregroundMuted'>
            Agent will start running automatically
            <br />
            once you trigger it
          </Text.H5>
        </div>
      </div>
    </OnboardingStep.Body>
  )
}
