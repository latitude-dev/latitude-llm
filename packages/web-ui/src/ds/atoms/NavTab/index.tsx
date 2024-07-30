import { ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cn } from '$ui/lib/utils'

import Text from '../Text'

type INavTabItem = {
  label: string
  selected?: boolean
  onClick?: () => void
  asChild?: boolean
}

function NavTabItem({
  onClick,
  label,
  asChild = false,
  selected,
}: INavTabItem) {
  const Comp = asChild ? Slot : 'div'

  return (
    <Comp
      onClick={onClick}
      className={cn('px-4 py-2 cursor-pointer', {
        'border-b-2 border-accent-foreground': selected,
      })}
    >
      <Text.H5M color={selected ? 'accentForeground' : 'foregroundMuted'}>
        {label}
      </Text.H5M>
    </Comp>
  )
}

function NavTabGroup({ children }: { children: ReactNode }) {
  return (
    <nav className='flex flex-row px-6 gap-2 bg-background'>{children}</nav>
  )
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
