import { ReactNode } from 'react'
import { cn } from '@latitude-data/web-ui/utils'

import AppHeader, { AppHeaderProps } from './Header'
import { User } from '@latitude-data/core/schema/types'
import DocumentationSidebarLayout from './DocumentationSidebarLayout'
import { DocumentationProvider } from '$/components/Documentation/Provider'

export type AppLayoutProps = AppHeaderProps & {
  children: ReactNode
  currentUser: User | undefined
  scrollable?: boolean
}

export default function AppLayout({
  children,
  currentUser,
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
      <DocumentationProvider>
        <AppHeader
          currentUser={currentUser}
          cloudInfo={cloudInfo}
          isCloud={isCloud}
        />
        <DocumentationSidebarLayout>
          <main className='w-full flex-grow min-h-0 h-full relative'>
            {children}
          </main>
        </DocumentationSidebarLayout>
      </DocumentationProvider>
    </div>
  )
}
