'use client'

import NocodersNavbar from '../Navbar/NocodersNavbar'
import {
  SetupIntegrationsIconAndTitle,
  SetupIntegrationsContent,
} from './setupIntegrations'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import {
  ConfigureTriggersIconAndTitle,
  ConfigureTriggersContent,
} from './configureTriggers'
import { TriggerAgentIconAndTitle, TriggerAgentContent } from './triggerAgent'
import { useCallback, useState } from 'react'
import { RunAgentIconAndTitle, RunAgentContent } from './runAgent'
import {
  ActiveTrigger,
  FAKE_DOCUMENT,
} from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggersList'
import { useRunDocument } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/hooks/useRunDocument'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { DocumentVersion } from '@latitude-data/core/schema/types'
import { OnboardingStep } from '$/app/(onboarding)/onboarding/lib/OnboardingStep'

export function OnboardingClient({
  onboardingSteps,
}: {
  onboardingSteps: OnboardingStepKey[]
}) {
  const {
    onboarding,
    moveNextOnboardingStep,
    isLoading: isLoadingOnboarding,
    executeCompleteOnboarding,
  } = useWorkspaceOnboarding()

  const currentStep = onboarding?.currentStep
    ? onboarding?.currentStep
    : onboardingSteps[0]

  const [activeTrigger, setActiveTrigger] = useState<ActiveTrigger>({
    document: FAKE_DOCUMENT,
    parameters: {},
  })

  return (
    <div className='flex flex-row flex-1 items-start'>
      <NocodersNavbar
        onboardingSteps={onboardingSteps}
        executeCompleteOnboarding={executeCompleteOnboarding}
        currentStep={currentStep}
        isLoadingOnboarding={isLoadingOnboarding}
      />
      <div className='flex-row flex-1 h-full'>
        {currentStep === OnboardingStepKey.SetupIntegrations && (
          <OnboardingStep
            iconAndTitle={<SetupIntegrationsIconAndTitle />}
            content={
              <SetupIntegrationsContent
                moveNextOnboardingStep={moveNextOnboardingStep}
              />
            }
          />
        )}
        {currentStep === OnboardingStepKey.ConfigureTriggers && (
          <OnboardingStep
            iconAndTitle={<ConfigureTriggersIconAndTitle />}
            content={
              <ConfigureTriggersContent
                moveNextOnboardingStep={moveNextOnboardingStep}
              />
            }
          />
        )}
        {(currentStep === OnboardingStepKey.TriggerAgent ||
          currentStep === OnboardingStepKey.RunAgent) && (
          <PlaygroundSteps
            moveNextOnboardingStep={moveNextOnboardingStep}
            setActiveTrigger={setActiveTrigger}
            currentStep={currentStep}
            executeCompleteOnboarding={executeCompleteOnboarding}
            activeTrigger={activeTrigger}
          />
        )}
      </div>
    </div>
  )
}

function PlaygroundSteps({
  moveNextOnboardingStep,
  setActiveTrigger,
  currentStep,
  executeCompleteOnboarding,
  activeTrigger,
}: {
  moveNextOnboardingStep: ({
    currentStep,
  }: {
    currentStep: OnboardingStepKey
  }) => void
  setActiveTrigger: (trigger: ActiveTrigger) => void
  currentStep: OnboardingStepKey
  executeCompleteOnboarding: () => void
  activeTrigger: ActiveTrigger
}) {
  const commit = useCurrentCommit()

  const { runDocument, addMessages, hasActiveStream } = useRunDocument({
    commit: commit.commit,
  })

  const runPromptFn = useCallback(
    ({
      document,
      userMessage,
      parameters = {},
      aiParameters = true,
    }: {
      document: DocumentVersion
      parameters: Record<string, unknown>
      userMessage: string | undefined
      aiParameters: boolean
    }) =>
      runDocument({
        document,
        parameters,
        userMessage,
        aiParameters,
      }),
    [runDocument],
  )

  const playground = usePlaygroundChat({
    runPromptFn,
    addMessagesFn: addMessages,
    onPromptRan: (documentLogUuid, error) => {
      if (!documentLogUuid || error) return
    },
  })

  return (
    <>
      {currentStep === OnboardingStepKey.TriggerAgent && (
        <OnboardingStep
          iconAndTitle={<TriggerAgentIconAndTitle />}
          content={
            <TriggerAgentContent
              moveNextOnboardingStep={moveNextOnboardingStep}
              setActiveTrigger={setActiveTrigger}
              playground={playground}
            />
          }
        />
      )}
      {currentStep === OnboardingStepKey.RunAgent && (
        <OnboardingStep
          iconAndTitle={
            <RunAgentIconAndTitle
              playground={playground}
              hasActiveStream={hasActiveStream}
            />
          }
          content={
            <RunAgentContent
              executeCompleteOnboarding={executeCompleteOnboarding}
              activeTrigger={activeTrigger}
              playground={playground}
              hasActiveStream={hasActiveStream}
            />
          }
        />
      )}
    </>
  )
}
