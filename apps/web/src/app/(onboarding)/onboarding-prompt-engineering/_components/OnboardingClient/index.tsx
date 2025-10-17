'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useState } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useRunOnboardingPrompt } from '$/app/(onboarding)/onboarding-prompt-engineering/_components/OnboardingClient/useRunPrompt'
import { OnboardingPromptStep } from '$/app/(onboarding)/onboarding-prompt-engineering/_components/OnboardingClient/PromptStep'
import { ExperimentStep } from '$/app/(onboarding)/onboarding-prompt-engineering/_components/OnboardingClient/ExperimentStep'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'

import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { User } from '@latitude-data/core/schema/models/types/User'
import { useCurrentWorkspace } from '$/app/providers/WorkspaceProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { publishEventAction } from '$/actions/events/publishEventAction'

type OnboardingStep1ContentProps = {
  document: DocumentVersion
  dataset: Dataset
  user: User
}

export enum OnboardingStep {
  ShowPrompt = 1,
  ShowResultsAndExperiment = 2,
}

export function OnboardingClient({
  document,
  dataset,
  user,
}: OnboardingStep1ContentProps) {
  const { workspace } = useCurrentWorkspace()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    OnboardingStep.ShowPrompt,
  )
  const { toast } = useToast()
  const { start, messages, activeStream } = useRunOnboardingPrompt({
    project,
    commit,
    document,
    setCurrentStep,
  })

  const { execute: publishEvent } = useLatitudeAction(publishEventAction)
  const { executeCompleteOnboarding } = useWorkspaceOnboarding()

  const onCompleteOnboarding = useCallback(
    async ({ experimentUuids }: { experimentUuids: string[] }) => {
      await executeCompleteOnboarding({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        experimentUuids: experimentUuids,
      })
      toast({
        title: 'Experiment started!',
        description:
          "Welcome onboard! Let's check out the results of your experiment",
      })
      publishEvent({
        eventType: 'promptEngineeringOnboardingCompleted',
        payload: {
          workspaceId: workspace.id,
          userEmail: user.email,
        },
      })
    },
    [
      executeCompleteOnboarding,
      project.id,
      commit.uuid,
      document.documentUuid,
      toast,
      workspace.id,
      publishEvent,
      user.email,
    ],
  )

  return (
    <div className='space-y-16'>
      <div className='space-y-2'>
        <Text.H2B centered display='block'>
          Welcome to Latitude!
        </Text.H2B>
        <Text.H5 centered display='block' color='foregroundMuted'>
          Hello {workspace.name || 'there'}! Let's cover some Latitude basics.
        </Text.H5>
      </div>

      <div className='space-y-6'>
        <div className='relative min-h-[450px]'>
          <OnboardingPromptStep
            document={document}
            start={start}
            activeStream={activeStream}
            currentStep={currentStep}
            messages={messages}
          />

          <ExperimentStep
            document={document}
            dataset={dataset}
            currentStep={currentStep}
            messages={messages}
            onCompleteOnboarding={onCompleteOnboarding}
          />
        </div>
      </div>
    </div>
  )
}
