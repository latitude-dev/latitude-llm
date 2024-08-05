'use client'

import { ReactNode } from 'react'

import { AppLayoutProvider, SessionUser } from '@latitude-data/web-ui'

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
    <AppLayoutProvider
      appHeader={
        <AppHeader
          sectionLinks={sectionLinks}
          breadcrumbs={breadcrumbs}
          navigationLinks={navigationLinks}
          currentUser={currentUser}
        />
      }
    >
      {children}
    </AppLayoutProvider>
  )
}
