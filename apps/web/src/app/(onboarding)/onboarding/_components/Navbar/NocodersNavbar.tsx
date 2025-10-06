import { Fragment, useCallback } from 'react'
import { NavbarItem } from './NavbarItem'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { cn } from '@latitude-data/web-ui/utils'
import { StatusFlagState } from '@latitude-data/web-ui/molecules/StatusFlag'
import { ROUTES } from '$/services/routes'
import { ONBOARDING_STEP_CONTENT } from '../../constants'
import { calculateState } from './calculateState'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { redirect } from 'next/navigation'

export default function NocodersNavbar({
  onboardingSteps,
  currentStep,
  isLoadingOnboarding,
  executeCompleteOnboarding,
}: {
  onboardingSteps: OnboardingStepKey[]
  executeCompleteOnboarding: () => void
  currentStep: OnboardingStepKey | undefined | null // TODO(onboarding): remove null when data migration is done
  isLoadingOnboarding: boolean
}) {
  const { project } = useCurrentProject()

  const skipOnboarding = useCallback(() => {
    executeCompleteOnboarding()
    redirect(ROUTES.dashboard.root)
  }, [executeCompleteOnboarding])

  const filteredNavbarSteps = Object.entries(ONBOARDING_STEP_CONTENT).filter(
    ([key]) => onboardingSteps.includes(key as OnboardingStepKey),
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
                  <NavbarItem
                    title={item.title}
                    description={item.description}
                    state={
                      isLoadingOnboarding
                        ? StatusFlagState.pending
                        : calculateState(key as OnboardingStepKey, currentStep)
                    }
                  />
                </div>
                {index ===
                Object.entries(ONBOARDING_STEP_CONTENT).length - 1 ? null : (
                  <Separator variant='dashed' />
                )}
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
