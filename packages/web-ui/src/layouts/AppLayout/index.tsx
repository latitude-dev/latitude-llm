import { ReactNode } from 'react'

import AppHeader, { AppHeaderProps } from '$ui/layouts/AppLayout/Header'
import { SessionUser } from '$ui/providers'

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
    <div className='flex flex-col h-screen'>
      <AppHeader
        breadcrumbs={breadcrumbs}
        navigationLinks={navigationLinks}
        currentUser={currentUser}
      />
      {children}
    </div>
  )
}
