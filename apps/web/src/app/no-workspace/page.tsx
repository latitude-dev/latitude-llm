import { createSupportUserIdentity } from '$/app/(private)/_lib/createSupportUserIdentity'
import { IntercomProvider } from '$/components/IntercomSupportChat'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Link from 'next/link'

export default async function NoWorkspace() {
  const { user } = await getCurrentUserOrRedirect()
  const supportIdentity = createSupportUserIdentity(user)

  return (
    <IntercomProvider showDefaultLauncher identity={supportIdentity}>
      <div className='flex items-center justify-center p-4 h-screen'>
        <div className='max-w-xl flex flex-col items-center justify-center gap-y-2'>
          <Alert
            variant='destructive'
            title='No workspace found'
            description={`It looks like the email ${user.email} is not associated with any workspace. Please contact support if you believe this is a mistake.`}
          />
          <Link href={ROUTES.dashboard.root}>
            <Button fancy variant='outline'>
              Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </IntercomProvider>
  )
}
