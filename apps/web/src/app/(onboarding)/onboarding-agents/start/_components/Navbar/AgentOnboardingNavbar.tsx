import { Fragment, useCallback } from 'react'
import { AgentNavbarItem } from './AgentNavbarItem'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { cn } from '@latitude-data/web-ui/utils'
import { StatusFlagState } from '@latitude-data/web-ui/molecules/StatusFlag'
import { ONBOARDING_STEP_CONTENT } from '../../constants'
import { calculateState } from './calculateState'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentWorkspace } from '$/app/providers/WorkspaceProvider'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { publishEventAction } from '$/actions/events/publishEventAction'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { usePlayground } from '../../lib/PlaygroundProvider'
import { User } from '@latitude-data/core/schema/types'

export default function AgentOnboardingNavbar({
  onboardingSteps,
  currentStep,
  isLoadingOnboarding,
  executeCompleteOnboarding,
  user,
}: {
  onboardingSteps: OnboardingStepKey[]
  executeCompleteOnboarding: ({
    projectId,
    commitUuid,
  }: {
    projectId: number
    commitUuid: string
  }) => void
  currentStep: OnboardingStepKey
  isLoadingOnboarding: boolean
  user: User
}) {
  const { execute: publishEvent } = useLatitudeAction(publishEventAction)
  const { project } = useCurrentProject()
  const { workspace } = useCurrentWorkspace()
  const { commit } = useCurrentCommit()
  const { abortCurrentStream } = usePlayground()

  const skipOnboarding = useCallback(() => {
    executeCompleteOnboarding({
      projectId: project.id,
      commitUuid: commit.uuid,
    })
    abortCurrentStream()
    publishEvent({
      eventType: 'agentOnboardingSkipped',
      payload: {
        userEmail: user.email,
        workspaceId: workspace.id,
      },
    })
  }, [
    executeCompleteOnboarding,
    publishEvent,
    workspace.id,
    project.id,
    commit.uuid,
    abortCurrentStream,
    user.email,
  ])

  const ONBOARDING_STEPS = Object.entries(ONBOARDING_STEP_CONTENT)
  const isLast = ONBOARDING_STEPS.length - 1
  const filteredNavbarSteps = ONBOARDING_STEPS.filter(([key]) =>
    onboardingSteps.includes(key as OnboardingStepKey),
  )

  return (
    <div className='flex flex-col p-6 items-start gap-8 h-full'>
      <div className='flex flex-col justify-between p-6 flex-1 rounded-3xl bg-secondary'>
        <div className='flex flex-col gap-6 items-start'>
          <div className='flex flex-col gap-1'>
            <Text.H5 color='foregroundMuted'>Create your first agent</Text.H5>
            <Text.H3M color='foreground'>{project.name}</Text.H3M>
          </div>
          <div className='flex flex-col gap-4'>
            {filteredNavbarSteps.map(([key, item], index) => (
              <Fragment key={index}>
                <div className={cn(currentStep === key ? '' : 'opacity-70')}>
                  <AgentNavbarItem
                    title={item.title}
                    description={item.description}
                    state={
                      isLoadingOnboarding
                        ? StatusFlagState.pending
                        : calculateState(key as OnboardingStepKey, currentStep)
                    }
                  />
                </div>
                {index === isLast ? null : <Separator variant='dashed' />}
              </Fragment>
            ))}
          </div>
        </div>
        <div className='flex flex-col gap-3'>
          <Text.H5 align='center' color='foregroundMuted'>
            Already know how Latitude works?
          </Text.H5>
          <Button roundy fancy onClick={skipOnboarding} variant='outline'>
            <Text.H5M>Skip Onboarding</Text.H5M>
          </Button>
        </div>
      </div>
    </div>
  )
}
