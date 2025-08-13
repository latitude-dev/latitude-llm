'use client'

import { useEffect } from 'react'

import { ErrorComponent, useSession } from '@latitude-data/web-ui/browser'
import * as Sentry from '@sentry/nextjs'

export default function Error({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const session = useSession()

  useEffect(() => {
    Sentry.captureException(error, { user: session.currentUser })
  }, [error, session.currentUser])

  return (
    <ErrorComponent
      type='red'
      message='Please, try again and if the error persists contact us.'
    />
  )
}
