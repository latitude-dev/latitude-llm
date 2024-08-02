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
  sectionLinks,
}: AppLayoutProps) {
  return (
    <div className='flex flex-col h-screen'>
      <AppHeader
        sectionLinks={sectionLinks}
        breadcrumbs={breadcrumbs}
        navigationLinks={navigationLinks}
        currentUser={currentUser}
      />
      <main className='flex flex-row w-full h-full'>{children}</main>
    </div>
  )
}
