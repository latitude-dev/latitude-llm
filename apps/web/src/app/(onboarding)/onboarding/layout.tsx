'use server'

import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { redirect } from 'next/navigation'
import { ReactNode } from 'react'

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  const { workspace, user } = await getCurrentUserOrRedirect()

  if (!user) return redirect(ROUTES.auth.login)

  return (
    <CSPostHogProvider>
      <IdentifyUser user={user} workspace={workspace}>
        <div className='flex min-h-screen flex-col max-w-[768px] pt-12 pb-4 m-auto'>
          <div className='flex items-center justify-center'>
            <Icon name='logo' size='large' />
          </div>
          {children}
        </div>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
