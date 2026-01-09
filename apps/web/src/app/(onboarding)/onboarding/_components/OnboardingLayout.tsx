'use client'

import { ReactNode } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'

export function OnboardingLayout({
  children,
  className,
  centered = true,
  hideHeader = false,
}: {
  children: ReactNode
  className?: string
  centered?: boolean
  hideHeader?: boolean
}) {
  return (
    <div className='flex flex-col min-h-screen bg-background'>
      {!hideHeader && (
        <header className='flex items-center justify-center px-6 py-4'>
          <Icon name='logo' size='xlarge' />
        </header>
      )}
      <main
        className={cn(
          'flex-1 flex flex-col px-6 pb-8',
          centered && 'items-center justify-center',
          className,
        )}
      >
        {children}
      </main>
    </div>
  )
}

