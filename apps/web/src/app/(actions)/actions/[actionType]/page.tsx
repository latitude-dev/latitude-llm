'use server'

import buildMetatags from '$/app/_lib/buildMetatags'
import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import {
  ActionBackendParameters,
  ActionType,
} from '@latitude-data/constants/actions'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ClientPage } from './_lib'

export async function generateMetadata() {
  return buildMetatags({
    title: 'Actions',
  })
}

export default async function Actions({
  params,
  searchParams,
}: {
  params: Promise<{ actionType: ActionType }>
  searchParams: Promise<ActionBackendParameters>
}) {
  const { actionType: type } = await params
  const parameters = await searchParams
  const { workspace, user, subscriptionPlan } = await getCurrentUserOrRedirect()

  return (
    <CSPostHogProvider>
      <IdentifyUser
        user={user}
        workspace={workspace}
        subscription={subscriptionPlan}
      >
        <div className='w-full h-full flex flex-col items-center justify-center gap-4 max-w-80 m-auto'>
          <div className='flex flex-col items-center justify-center gap-y-8 text-muted-foreground'>
            <Icon name='logo' size='xxxlarge' />
            <div className='flex flex-col items-center justify-center gap-y-2'>
              <ClientPage
                type={type}
                parameters={parameters}
                user={user}
                workspace={workspace}
              />
            </div>
          </div>
        </div>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
