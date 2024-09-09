import { Button } from '@latitude-data/web-ui'
import { ErrorComponent } from '@latitude-data/web-ui/browser'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import { AppLayout } from '$/components/layouts'
import { getSafeCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export default async function GlobalNoFound() {
  const session = await getSafeCurrentUser()
  return (
    <AppLayout
      currentUser={session?.user}
      breadcrumbs={session?.workspace ? [{ name: session.workspace.name }] : []}
      navigationLinks={NAV_LINKS}
    >
      <ErrorComponent
        type='gray'
        message="We couldn't find what you are looking for. Please make sure that the page exists and try again."
        submit={
          <Link href={ROUTES.root}>
            <Button>Go to Homepage</Button>
          </Link>
        }
      />
    </AppLayout>
  )
}
