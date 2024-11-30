'use client'

import { ReactNode } from 'react'

import { cn, SessionUser, Text, ThemeButton } from '@latitude-data/web-ui'

import AvatarDropdown from './AvatarDropdown'
import { HeaderBreadcrumb } from './Breadcrumb'
import { RewardsButton } from './Rewards'
import { UsageIndicator } from './UsageIndicator'

export function AppHeaderWrapper({
  children,
  xPadding = 'normal',
}: {
  children: ReactNode
  xPadding?: 'normal' | 'none'
}) {
  return (
    <header
      className={cn(
        'flex flex-row items-center justify-between',
        'border-b border-b-border bg-background',
        'sticky top-0 isolate px-6 py-3 z-10',
        { 'px-6': xPadding === 'normal', 'px-0': xPadding === 'none' },
      )}
    >
      {children}
    </header>
  )
}

type INavigationLink = {
  label: string
  href?: string
  index?: boolean
  onClick?: () => void
  _target?: '_blank' | '_self'
}

function NavLink({ label, href, onClick, _target }: INavigationLink) {
  return (
    <Text.H5 asChild>
      <a href={href} onClick={onClick} target={_target}>
        {label}
      </a>
    </Text.H5>
  )
}

export type AppHeaderProps = {
  navigationLinks: INavigationLink[]
  currentUser: SessionUser | undefined
}
export default function AppHeader({
  navigationLinks,
  currentUser,
}: AppHeaderProps) {
  return (
    <AppHeaderWrapper>
      <HeaderBreadcrumb />
      <div className='flex flex-row items-center gap-x-6 pl-6'>
        <nav className='flex flex-row gap-x-4 items-center'>
          <RewardsButton />
          <UsageIndicator />
          {navigationLinks.map((link, idx) => (
            <NavLink key={idx} {...link} />
          ))}
        </nav>
        <AvatarDropdown currentUser={currentUser} />
        <ThemeButton />
      </div>
    </AppHeaderWrapper>
  )
}
