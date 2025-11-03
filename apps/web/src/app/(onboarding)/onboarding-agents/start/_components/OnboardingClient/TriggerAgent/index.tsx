import { useCallback, useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import useDocumentTriggers from '$/stores/documentTriggers'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { RunTrigger } from './_components/RunTrigger'
import useIntegrations from '$/stores/integrations'
import { IsLoadingOnboardingItem } from '../../../lib/IsLoadingOnboardingItem'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { OnboardingStep } from '../../../../../_lib/OnboardingStep'
import { usePlayground } from '../../../lib/PlaygroundProvider'
import { RunDocumentProps } from '$/components/TriggersManagement/types'
import { AgentInput } from '$/components/Agent/AgentInput'
import useDocumentVersions from '$/stores/documentVersions'

export function TriggerAgentHeader() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { data: triggers } = useDocumentTriggers({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  return (
    <OnboardingStep.Header>
      <div className='p-2 border-2 rounded-lg'>
        <Icon className='' name='mousePointerClick' size='medium' />
      </div>
      <Text.H2M color='foreground' noWrap>
        Trigger the agent
      </Text.H2M>
      {triggers.length > 0 ? (
        <Text.H5 color='foregroundMuted'>
          Perform one of the below actions to trigger and run the agent
        </Text.H5>
      ) : (
        <Text.H5 color='foregroundMuted'>
          Send a message to your agent to run it!
        </Text.H5>
      )}
    </OnboardingStep.Header>
  )
}

export function TriggerAgentBody({
  moveNextOnboardingStep,
  setParameters,
}: {
  moveNextOnboardingStep: ({
    currentStep,
  }: {
    currentStep: OnboardingStepKey
  }) => void
  setParameters: (parameters: Record<string, unknown>) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { playground } = usePlayground()

  const { data: triggers, isLoading: isLoadingTriggers } = useDocumentTriggers({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  const { data: integrations, isLoading: isLoadingIntegrations } =
    useIntegrations()

  const { data: documents } = useDocumentVersions({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  const mainDocument = useMemo<DocumentVersion | undefined>(
    () => documents?.find((d) => d.documentUuid === commit.mainDocumentUuid),
    [documents, commit.mainDocumentUuid],
  )

  const sortedTriggersByIntegrationFirst = useMemo(() => {
    return triggers.sort((a) => {
      return a.triggerType === DocumentTriggerType.Integration ? -1 : 1
    })
  }, [triggers])

  const onRunTrigger = useCallback(
    ({
      document,
      parameters,
      userMessage,
      aiParameters = false,
    }: RunDocumentProps) => {
      setParameters(parameters)
      playground.start({ document, parameters, userMessage, aiParameters })
      moveNextOnboardingStep({ currentStep: OnboardingStepKey.TriggerAgent })
    },
    [setParameters, moveNextOnboardingStep, playground],
  )

  if (!mainDocument) return null

  return (
    <OnboardingStep.Body>
      {sortedTriggersByIntegrationFirst.length > 0 ? (
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
                integrations={integrations}
              />
            ))
          )}
        </div>
      ) : null}
      <div className='flex flex-col gap-6 w-full max-w-[500px]'>
        <AgentInput document={mainDocument} runPromptFn={onRunTrigger} />
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
