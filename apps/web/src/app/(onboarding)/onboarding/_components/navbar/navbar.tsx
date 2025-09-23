import { useMemo, useState, Fragment } from 'react'
import { NavBarItem, NavbarTab } from './navbarItem'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { cn } from '@latitude-data/web-ui/utils'

export default function NocodersNavbar() {
  // useState for the navbar state, should be a list of them as they keep completing onboarding steps
  const [currentTab, setCurrentTab] = useState<NavbarTab>(
    NavbarTab.setupIntegrations,
  )

  const navbarItems = useMemo(() => {
    return [
      {
        key: NavbarTab.setupIntegrations,
        title: 'Set up integrations',
        description: 'Enable agent to connect to apps',
      },
      {
        key: NavbarTab.configureTriggers,
        title: 'Configure triggers',
        description: 'Adjust triggers to your use case',
      },
      {
        key: NavbarTab.triggerAgent,
        title: 'Trigger agent',
        description: 'Wait for an event or trigger agent directly',
      },
      {
        key: NavbarTab.runAgent,
        title: 'Run',
        description: 'Watch agent perform',
      },
    ]
  }, [])

  return (
    <div className='flex flex-col p-6 items-start gap-8 h-full'>
      <div className='flex flex-col justify-between p-6 flex-1 rounded-3xl bg-secondary'>
        <div className='flex flex-col gap-6 items-start'>
          <div className='flex flex-col gap-1'>
            <Text.H5 color='foregroundMuted'>Create your first agent</Text.H5>
            <Text.H3M color='foreground'>Fill in here name of agent</Text.H3M>
          </div>
          <div className='flex flex-col gap-4'>
            {navbarItems.map((item, index) => (
              <Fragment key={index}>
                <div
                  key={index}
                  className={cn(currentTab === item.key ? '' : 'opacity-70')}
                >
                  <NavBarItem
                    title={item.title}
                    description={item.description}
                  />
                </div>
                {index === navbarItems.length - 1 ? null : <Separator />}
              </Fragment>
            ))}
          </div>
        </div>
        <div className='flex flex-col gap-3'>
          <Text.H5 align='center' color='foregroundMuted'>
            Already know how Latitude works?
          </Text.H5>
          <Button roundy fancy>
            <Text.H5M>Skip Onboarding</Text.H5M>
          </Button>
        </div>
      </div>
    </div>
  )
}
