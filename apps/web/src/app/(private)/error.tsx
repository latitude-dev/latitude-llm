'use client'

import { useEffect } from 'react'

import { ErrorComponent, useSession } from '@latitude-data/web-ui/browser'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import { AppLayout } from '$/components/layouts'

export default function Error({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void // Re-render of page
}) {
  const session = useSession()
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <AppLayout
      currentUser={session.currentUser}
      breadcrumbs={[{ name: session.workspace.name }, { name: 'Error' }]}
      navigationLinks={NAV_LINKS}
    >
      <ErrorComponent
        type='red'
        message='Something went wrong. Please, try again and if the error persists contact us.'
      />
    </AppLayout>
  )
}
