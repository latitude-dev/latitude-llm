'use server'

import React from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { SkipOnboardingButton } from '$/components/onboarding/skipOnboardingButton'
import { CSPostHogProvider } from '$/app/providers'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <CSPostHogProvider>
      <div className='flex min-h-screen flex-col max-w-[768px] pt-12 pb-4 m-auto'>
        <div className='flex items-center justify-center'>
          <Icon name='logo' size='large' />
        </div>
        {children}
        <SkipOnboardingButton />
      </div>
    </CSPostHogProvider>
  )
}
