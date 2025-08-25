import type { ReactNode } from 'react'

import type { User } from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'

import AppHeader, { type AppHeaderProps } from './Header'
import RightSidebarLayout from './RightSidebarLayout'

type AppLayoutProps = AppHeaderProps & {
  children: ReactNode
  currentUser: User | undefined
  scrollable?: boolean
}

export default function AppLayout({
  children,
  currentUser,
  navigationLinks,
  scrollable = true,
  cloudInfo,
  isCloud,
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
        isCloud={isCloud}
      />
      <RightSidebarLayout>
        <main className='w-full flex-grow min-h-0 h-full relative'>{children}</main>
      </RightSidebarLayout>
    </div>
  )
}
