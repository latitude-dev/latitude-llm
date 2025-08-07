import { ReactNode } from 'react'

import { SessionUser } from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'

import AppHeader, { AppHeaderProps } from './Header'
import RightSidebarLayout from './RightSidebarLayout'

export type AppLayoutProps = AppHeaderProps & {
  children: ReactNode
  currentUser: SessionUser | undefined
  scrollable?: boolean
}

export default function AppLayout({
  children,
  currentUser,
  navigationLinks,
  scrollable = true,
  cloudInfo,
}: AppLayoutProps) {
  return (
    <div
      className={cn('flex flex-col h-screen overflow-hidden relative', {
        'overflow-y-auto custom-scrollbar': scrollable,
      })}
    >
      <AppHeader
        navigationLinks={navigationLinks}
        currentUser={currentUser}
        cloudInfo={cloudInfo}
      />
      <RightSidebarLayout>
        <main className='w-full flex-grow min-h-0 h-full relative'>
          {children}
        </main>
      </RightSidebarLayout>
    </div>
  )
}
