import type { ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cn } from '../../../lib/utils'
import { Text } from '../Text'

type INavTabItem = {
  label: string
  selected?: boolean
  onClick?: () => void
  asChild?: boolean
}

function NavTabItem({ onClick, label, asChild = false, selected }: INavTabItem) {
  const Comp = asChild ? Slot : 'div'

  return (
    <Comp onClick={onClick} className='cursor-pointer'>
      <div
        className={cn('py-1 px-2 rounded-md hover:bg-muted', {
          'bg-muted': selected,
        })}
      >
        <Text.H5M color={selected ? 'foreground' : 'foregroundMuted'}>{label}</Text.H5M>
      </div>
    </Comp>
  )
}

function NavTabGroup({ children }: { children: ReactNode }) {
  return <nav className='flex flex-row gap-2 py-1.5'>{children}</nav>
}

function NavTab({ tabs }: { tabs: INavTabItem[] }) {
  return (
    <NavTabGroup>
      {tabs.map((tab, idx) => (
        <NavTabItem key={idx} {...tab} />
      ))}
    </NavTabGroup>
  )
}

export { NavTab, NavTabGroup, NavTabItem }
