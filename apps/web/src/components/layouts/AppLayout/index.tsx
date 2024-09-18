import { ReactNode } from 'react'

import { SessionUser } from '@latitude-data/web-ui'

import AppHeader, { AppHeaderProps } from './Header'

export type AppLayoutProps = AppHeaderProps & {
  children: ReactNode
  currentUser: SessionUser | undefined
}

export default function AppLayout({
  children,
  currentUser,
  breadcrumbs,
  navigationLinks,
}: AppLayoutProps) {
  return (
    <div className='grid grid-rows-[auto,1fr] h-screen overflow-hidden'>
      <AppHeader
        breadcrumbs={breadcrumbs}
        navigationLinks={navigationLinks}
        currentUser={currentUser}
      />
      <main className='overflow-y-auto'>{children}</main>
    </div>
  )
}
