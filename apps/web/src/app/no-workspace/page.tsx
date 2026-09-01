import { createSupportUserIdentity } from '$/app/(private)/_lib/createSupportUserIdentity'
import { IntercomProvider } from '$/components/IntercomSupportChat'
import { ShutdownBanner } from '$/components/ShutdownBanner'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { env } from '@latitude-data/env'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Link from 'next/link'

export default async function NoWorkspace() {
  const { user } = await getCurrentUserOrRedirect()
  const supportIdentity = createSupportUserIdentity(user)

  return (
    <IntercomProvider identity={supportIdentity}>
      <div className='flex flex-col h-screen'>
        {env.LATITUDE_CLOUD ? <ShutdownBanner /> : null}
        <div className='flex flex-1 items-center justify-center p-4 min-h-0'>
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
      </div>
    </IntercomProvider>
  )
}
