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
      className={cn('flex flex-col h-screen overflow-hidden relative', {
        'overflow-y-auto custom-scrollbar': scrollable,
      })}
    >
      <AppHeader
        breadcrumbs={breadcrumbs}
        navigationLinks={navigationLinks}
        currentUser={currentUser}
      />
      <main className='w-full flex-grow min-h-0 h-full relative'>
        {children}
      </main>
    </div>
  )
}
