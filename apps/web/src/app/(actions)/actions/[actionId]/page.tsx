import buildMetatags from '$/app/_lib/buildMetatags'
import { CSPostHogProvider, IdentifyUser } from '$/app/providers'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { markWorkspaceOnboardingComplete } from '@latitude-data/core/services/workspaceOnboarding/update'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export const metadata = buildMetatags({
  title: 'Actions',
})

export default async function Actions({
  params,
  searchParams,
}: {
  params: Promise<Record<string, string>>
  searchParams: Promise<Record<string, string>>
}) {
  const parameters = { ...(await params), ...(await searchParams) }

  const { workspace, user } = await getCurrentUserOrRedirect()

  // TODO(actions): move to execute try catch action(actionId, parameters)
  try {
    const onboarding = await getWorkspaceOnboarding({ workspace }).then((r) => r.unwrap()) // prettier-ignore

    if (!onboarding.completedAt) {
      await markWorkspaceOnboardingComplete({ onboarding }).then((r) => r.unwrap()) // prettier-ignore
    }
  } catch (error) {
    // Fail silently
  }

  return (
    <CSPostHogProvider>
      <IdentifyUser user={user} workspace={workspace}>
        <div className='w-full h-full flex flex-col items-center justify-center gap-4 max-w-80 m-auto'>
          <div className='flex flex-col items-center justify-center gap-y-8 text-muted-foreground'>
            <Icon name='logo' size='xxxlarge' />
            <div className='flex flex-col items-center justify-center gap-y-2'>
              <div className='w-full h-full flex items-center justify-center gap-2'>
                <Icon
                  name='loader'
                  color='foreground'
                  className='animate-spin'
                />
                <Text.H4B align='center' color='foreground'>
                  Executing action
                </Text.H4B>
              </div>
              <Text.H5 align='center' color='foregroundMuted'>
                You should be redirected shortly
              </Text.H5>
            </div>
          </div>
        </div>
      </IdentifyUser>
    </CSPostHogProvider>
  )
}
