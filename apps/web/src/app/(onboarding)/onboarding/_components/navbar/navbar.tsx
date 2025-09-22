import { useMemo, useState } from 'react'
import { NavBarItem, NavbarTab } from './navbarItem'

export default function NocodersNavbar() {
  // useState for the navbar state, should be a list of them as they keep completing onboarding steps
  const [completedNavbarTabs, setCompletedNavbarTabs] = useState<NavbarTab[]>(
    [],
  )

  const navbarItems = useMemo(() => {
    return [
      {
        title: 'Set up integrations',
        description: 'Enable agent to connect to apps',
        onClick: () =>
          setCompletedNavbarTabs([...completedNavbarTabs, 'setupIntegrations']),
      },
      {
        title: 'Configure triggers',
        description: 'Adjust triggers to your use case',
        onClick: () =>
          setCompletedNavbarTabs([...completedNavbarTabs, 'configureTriggers']),
      },
      {
        title: 'Trigger agent',
        description: 'Wait for an event or trigger agent directly',
        onClick: () =>
          setCompletedNavbarTabs([...completedNavbarTabs, 'triggerAgent']),
      },
      {
        title: 'Run',
        description: 'Watch agent perform',
        onClick: () =>
          setCompletedNavbarTabs([...completedNavbarTabs, 'runAgent']),
      },
    ]
  }, [completedNavbarTabs])

  return (
    <div className='flex flex-col gap-2'>
      {navbarItems.map((item) => (
        <NavBarItem
          key={item.title}
          title={item.title}
          description={item.description}
          onClick={item.onClick}
        />
      ))}
    </div>
  )
}
