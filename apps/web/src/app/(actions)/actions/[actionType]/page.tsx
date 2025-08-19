'use server'

import buildMetatags from '$/app/_lib/buildMetatags'
import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import {
  ActionBackendParameters,
  ActionFrontendParameters,
  ActionType,
} from '@latitude-data/core/browser'
import { executeAction as executeBackendAction } from '@latitude-data/core/services/actions/execute'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { FailedAction, LoadingAction } from './_components'
import { FrontendAction } from './_lib/execute'

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
  const { workspace, user } = await getCurrentUserOrRedirect()

  let result: ActionFrontendParameters | undefined
  let error: Error | undefined
  try {
    result = await executeBackendAction({
      type: type,
      parameters: parameters,
      user: user,
      workspace: workspace,
    }).then((r) => r.unwrap())
  } catch (exception) {
    error = exception as Error
  }

  return (
    <CSPostHogProvider>
      <IdentifyUser user={user} workspace={workspace}>
        <div className='w-full h-full flex flex-col items-center justify-center gap-4 max-w-80 m-auto'>
          <div className='flex flex-col items-center justify-center gap-y-8 text-muted-foreground'>
            <Icon name='logo' size='xxxlarge' />
            <div className='flex flex-col items-center justify-center gap-y-2'>
              {error ? (
                <FailedAction error={error} />
              ) : result ? (
                <FrontendAction
                  type={type}
                  parameters={result}
                  user={user}
                  workspace={workspace}
                />
              ) : (
                <LoadingAction />
              )}
            </div>
          </div>
        </div>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
