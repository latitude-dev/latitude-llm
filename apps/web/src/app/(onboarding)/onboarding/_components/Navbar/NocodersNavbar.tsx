import { useMemo, Fragment, useCallback } from 'react'
import { NavBarItem } from './NavbarItem'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { cn } from '@latitude-data/web-ui/utils'
import { Project } from '@latitude-data/core/browser'
import { StatusFlagState } from '@latitude-data/web-ui/molecules/StatusFlag'
import { NavbarTabName } from '../../constants'
import { completeOnboardingAction } from '$/actions/workspaceOnboarding/complete'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'

export default function NocodersNavbar({
  project,
  currentTab,
}: {
  project: Project
  currentTab: NavbarTabName
}) {
  const navbarItems = useMemo(() => {
    return [
      {
        key: NavbarTabName.SetupIntegrations,
        title: 'Set up integrations',
        description: 'Enable agent to connect to apps',
        state: StatusFlagState.inProgress, // TODO(onboarding): create a new column in onboardingWorkspace to have the current step, then a store, an SWR, and an update action to be able to conserve this state
      },
      {
        key: NavbarTabName.ConfigureTriggers,
        title: 'Configure triggers',
        description: 'Adjust triggers to your use case',
        state: StatusFlagState.pending,
      },
      {
        key: NavbarTabName.TriggerAgent,
        title: 'Trigger agent',
        description: 'Wait for an event or trigger agent directly',
        state: StatusFlagState.pending,
      },
      {
        key: NavbarTabName.RunAgent,
        title: 'Run',
        description: 'Watch agent perform',
        state: StatusFlagState.pending,
      },
    ]
  }, [])

  const skipOnboarding = useCallback(() => {
    completeOnboardingAction()
    redirect(ROUTES.dashboard.root)
  }, [])

  return (
    <div className='flex flex-col p-6 items-start gap-8 h-full'>
      <div className='flex flex-col justify-between p-6 flex-1 rounded-3xl bg-secondary'>
        <div className='flex flex-col gap-6 items-start'>
          <div className='flex flex-col gap-1'>
            <Text.H5 color='foregroundMuted'>Create your first agent</Text.H5>
            <Text.H3M color='foreground'>{project.name}</Text.H3M>
          </div>
          <div className='flex flex-col gap-4'>
            {navbarItems.map((item, index) => (
              <Fragment key={index}>
                <div
                  className={cn(currentTab === item.key ? '' : 'opacity-70')}
                >
                  <NavBarItem
                    title={item.title}
                    description={item.description}
                    state={item.state}
                  />
                </div>
                {index === navbarItems.length - 1 ? null : (
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
