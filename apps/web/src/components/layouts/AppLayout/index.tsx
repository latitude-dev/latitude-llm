import { ReactNode } from 'react'

import { cn, SessionUser } from '@latitude-data/web-ui'

import AppHeader, { AppHeaderProps } from './Header'

export type AppLayoutProps = AppHeaderProps & {
  children: ReactNode
  currentUser: SessionUser | undefined
  scrollable?: boolean
}

export default function AppLayout({
  children,
  currentUser,
  breadcrumbs,
  navigationLinks,
  scrollable = true,
}: AppLayoutProps) {
  return (
    <div
      className={cn('grid grid-rows-[auto,1fr] h-screen overflow-hidden', {
        'overflow-y-auto': scrollable,
      })}
    >
      <AppHeader
        breadcrumbs={breadcrumbs}
        navigationLinks={navigationLinks}
        currentUser={currentUser}
      />
      <main>{children}</main>
    </div>
  )
}
