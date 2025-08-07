'use client'

import { completeOnboardingAction } from '$/actions/workspaceOnboarding/complete'
import { ExperimentStep } from '$/app/(onboarding)/onboarding/_components/OnboardingClient/ExperimentStep'
import { OnboardingPromptStep } from '$/app/(onboarding)/onboarding/_components/OnboardingClient/PromptStep'
import { useRunOnboardingPrompt } from '$/app/(onboarding)/onboarding/_components/OnboardingClient/useRunPrompt'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import {
  Commit,
  Dataset,
  DocumentVersion,
  Project,
} from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback, useState } from 'react'

type OnboardingStep1ContentProps = {
  workspaceName: string
  document: DocumentVersion
  project: Project
  commit: Commit
  dataset: Dataset
}

export enum OnboardingStep {
  ShowPrompt = 1,
  ShowResultsAndExperiment = 2,
}

export function OnboardingClient({
  workspaceName,
  document,
  project,
  commit,
  dataset,
}: OnboardingStep1ContentProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    OnboardingStep.ShowPrompt,
  )
  const navigate = useNavigate()
  const { toast } = useToast()
  const { start, messages, activeStream } = useRunOnboardingPrompt({
    project,
    commit,
    document,
    setCurrentStep,
  })

  const { execute: completeOnboarding } = useLatitudeAction(
    completeOnboardingAction,
  )
  const onCompleteOnboarding = useCallback(
    async ({ experimentUuids }: { experimentUuids: string[] }) => {
      await completeOnboarding()
      toast({
        title: 'Experiment started!',
        description:
          "Welcome onboard! Let's check out the results of your experiment",
      })
      setTimeout(async () => {
        navigate.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: document.documentUuid })
            .experiments.withSelected(experimentUuids),
        )
      }, 1000)
    },
    [
      completeOnboarding,
      navigate,
      project.id,
      commit.uuid,
      document.documentUuid,
      toast,
    ],
  )

  return (
    <div className='space-y-16'>
      <div className='space-y-2'>
        <Text.H2B centered display='block'>
          Welcome to Latitude!
        </Text.H2B>
        <Text.H5 centered display='block' color='foregroundMuted'>
          Hello {workspaceName || 'there'}! Let's cover some Latitude basics.
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
            project={project}
            commit={commit}
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
