'use client'

import { useEffect } from 'react'

import { ErrorComponent, useSession } from '@latitude-data/web-ui/browser'
import * as Sentry from '@sentry/nextjs'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import BreadcrumpLink from '$/components/BreadcrumpLink'
import { AppLayout } from '$/components/layouts'
import { ROUTES } from '$/services/routes'

export default function Error({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void // Re-render of page
}) {
  const session = useSession()

  useEffect(() => {
    Sentry.captureException(error, { user: session.currentUser })
  }, [error])

  return (
    <AppLayout
      currentUser={session.currentUser}
      breadcrumbs={[
        {
          name: (
            <BreadcrumpLink name={session.workspace.name} href={ROUTES.root} />
          ),
        },
        { name: 'Error' },
      ]}
      navigationLinks={NAV_LINKS}
    >
      <ErrorComponent
        type='red'
        message='Something went wrong. Please, try again and if the error persists contact us.'
      />
    </AppLayout>
  )
}
