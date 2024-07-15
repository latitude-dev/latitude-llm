import { AppLayout, ErrorComponent } from '@latitude-data/web-ui/browser'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import { getSafeCurrentUser } from '$/services/auth/getCurrentUser'

export default async function GlobalNoFound() {
  const session = await getSafeCurrentUser()
  return (
    <AppLayout
      currentUser={session?.user}
      breadcrumbs={session?.workspace ? [{ name: session.workspace.name }] : []}
      navigationLinks={NAV_LINKS}
    >
      <ErrorComponent
        message="We couldn't find what you are looking for. Please make sure that the page exists and try again."
        type='gray'
      />
    </AppLayout>
  )
}
