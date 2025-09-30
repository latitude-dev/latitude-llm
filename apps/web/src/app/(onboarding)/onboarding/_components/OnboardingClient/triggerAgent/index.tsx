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
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'

export function TriggerAgentStep({
  moveNextOnboardingStep,
  setActiveTrigger,
  playground,
}: {
  moveNextOnboardingStep: () => void
  setActiveTrigger: (trigger: ActiveTrigger) => void
  playground: ReturnType<typeof usePlaygroundChat>
}) {
  const [openChatInput, setOpenChatInput] = useState<boolean>(false)
  const toggleOpenChatInput = useCallback(() => {
    if (openChatInput) {
      setOpenChatInput(false)
    } else {
      setOpenChatInput(true)
    }
  }, [openChatInput])

  const { data: integrations } = useIntegrations()
  const project = useCurrentProject()
  const commit = useCurrentCommit()

  const { data: triggers } = useDocumentTriggers({
    projectId: project.project.id,
    commitUuid: commit.commit.uuid,
  })

  const activeChatTrigger = useActiveChatTrigger({
    commit: commit.commit,
    project: project.project,
    triggers,
  })

  const sortedTriggersByIntegrationFirst = useMemo(() => {
    return triggers.sort((a) => {
      return a.triggerType === DocumentTriggerType.Integration ? -1 : 1
    })
  }, [triggers])

  const onRunTrigger: OnRunTriggerFn = useCallback(
    ({ document, parameters, userMessage, aiParameters = false }) => {
      setActiveTrigger({ document, parameters, userMessage })
      playground.start({ document, parameters, userMessage, aiParameters })
      moveNextOnboardingStep()
    },
    [setActiveTrigger, moveNextOnboardingStep, playground],
  )

  return (
    <div className='flex flex-col items-center p-32 gap-10'>
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
      <div className='flex flex-col items-center gap-2 border-dashed border-2 rounded-xl p-2 w-full max-w-[600px]'>
        {sortedTriggersByIntegrationFirst.map((trigger) => (
          <RunTrigger
            key={trigger.uuid}
            trigger={trigger}
            onRunTrigger={onRunTrigger}
            onRunChatTrigger={toggleOpenChatInput}
            integrations={integrations}
          />
        ))}
      </div>
      <div className='flex flex-col gap-6 w-full max-w-[600px]'>
        {activeChatTrigger.active && openChatInput ? (
          <div className='sticky bottom-6'>
            <ChatTriggerTextarea
              key={activeChatTrigger.activeKey}
              commit={commit.commit}
              project={project.project}
              document={activeChatTrigger.active.document}
              chatTrigger={activeChatTrigger.active.trigger}
              chatFocused={activeChatTrigger.chatBoxFocused}
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
    </div>
  )
}
