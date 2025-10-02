'use client'

import NocodersNavbar from '../Navbar/NocodersNavbar'
import { SetupIntegrationsStep } from './setupIntegrations'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { ConfigureTriggersStep } from './configureTriggers'
import { TriggerAgentStep } from './triggerAgent'
import { useCallback, useRef, useState } from 'react'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { RunAgentStep } from './runAgent'
import {
  ActiveTrigger,
  FAKE_DOCUMENT,
} from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggersList'
import { useRunDocument } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/hooks/useRunDocument'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { DocumentVersion } from '@latitude-data/core/schema/types'

export function OnboardingClient() {
  const {
    onboarding: currentOnboarding,
    moveNextOnboardingStep,
    isLoading: isLoadingOnboarding,
    executeCompleteOnboarding,
  } = useWorkspaceOnboarding()

  const currentStep = currentOnboarding?.currentStep

  const containerRef = useRef<HTMLDivElement | null>(null)

  useAutoScroll(containerRef, { startAtBottom: true })

  const [activeTrigger, setActiveTrigger] = useState<ActiveTrigger>({
    document: FAKE_DOCUMENT,
    parameters: {},
  })

  return (
    <div className='flex flex-row flex-1 items-start custom-scrollbar'>
      <NocodersNavbar
        executeCompleteOnboarding={executeCompleteOnboarding}
        currentStep={currentStep}
        isLoadingOnboarding={isLoadingOnboarding}
      />
      <div
        ref={containerRef}
        className='flex-row flex-1 h-full overflow-y-auto'
      >
        {currentStep === OnboardingStepKey.SetupIntegrations && (
          <SetupIntegrationsStep
            moveNextOnboardingStep={moveNextOnboardingStep}
          />
        )}
        {currentStep === OnboardingStepKey.ConfigureTriggers && (
          <ConfigureTriggersStep
            moveNextOnboardingStep={moveNextOnboardingStep}
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
  moveNextOnboardingStep: () => void
  setActiveTrigger: (trigger: ActiveTrigger) => void
  currentStep: OnboardingStepKey
  executeCompleteOnboarding: () => void
  activeTrigger: ActiveTrigger
}) {
  const commit = useCurrentCommit()

  const { runDocument, addMessages } = useRunDocument({
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
        <TriggerAgentStep
          moveNextOnboardingStep={moveNextOnboardingStep}
          setActiveTrigger={setActiveTrigger}
          playground={playground}
        />
      )}
      {currentStep === OnboardingStepKey.RunAgent && (
        <RunAgentStep
          moveNextOnboardingStep={executeCompleteOnboarding}
          activeTrigger={activeTrigger}
          playground={playground}
        />
      )}
    </>
  )
}
