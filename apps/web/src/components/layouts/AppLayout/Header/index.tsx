'use client'
import { ReactNode } from 'react'

import { LATITUDE_SLACK_URL } from '@latitude-data/core/constants'
import { User } from '@latitude-data/core/schema/models/types/User'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

import AvatarDropdown from './AvatarDropdown'
import { HeaderBreadcrumb } from './Breadcrumb'
import { TrialBadge } from './TrialBadge'
import { UsageIndicator } from './UsageIndicator'

import Link from 'next/link'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useDocs } from '$/components/Documentation/Provider'

export function AppHeaderWrapper({
  children,
  xPadding = 'normal',
}: {
  children: ReactNode
  xPadding?: 'normal' | 'none'
}) {
  return (
    <header
      className={cn(
        'flex flex-row items-center justify-between',
        'border-b border-border bg-background',
        'sticky top-0 isolate py-3 z-10',
        { 'pl-6 pr-3': xPadding === 'normal', 'px-0': xPadding === 'none' },
        'max-h-12',
      )}
    >
      {children}
    </header>
  )
}

export type AppHeaderProps = {
  currentUser: User | undefined
  cloudInfo?: { paymentUrl: string }
  isCloud: boolean
}
export default function AppHeader({
  currentUser,
  cloudInfo,
  isCloud,
}: AppHeaderProps) {
  const { open, isOpen } = useDocs()

  return (
    <AppHeaderWrapper>
      <HeaderBreadcrumb />
      <div className='flex flex-row items-center pl-6'>
        <nav className='flex flex-row gap-x-4 items-center'>
          {cloudInfo ? (
            <>
              <TrialBadge />
              <UsageIndicator />
            </>
          ) : null}

          <Link href={LATITUDE_SLACK_URL} className='pb-px' target='_blank'>
            <Text.H5>Slack</Text.H5>
          </Link>

          <Button variant='ghost' className='p-0' onClick={() => open(!isOpen)}>
            <Text.H5>Docs</Text.H5>
          </Button>
        </nav>
        <AvatarDropdown currentUser={currentUser} isCloud={isCloud} />
      </div>
    </AppHeaderWrapper>
  )
}
