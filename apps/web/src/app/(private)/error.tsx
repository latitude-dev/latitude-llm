'use client'

import { useEffect } from 'react'

import { captureClientError } from '$/instrumentation-client'
import { ErrorComponent } from '@latitude-data/web-ui/browser'
import { useSession } from '$/components/Providers/SessionProvider'

export default function Error({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const session = useSession()

  useEffect(() => {
    captureClientError(error, {
      component: 'Error',
      userId: session.currentUser?.id,
      userEmail: session.currentUser?.email,
      digest: error.digest,
    })
  }, [error, session.currentUser])

  return (
    <ErrorComponent
      type='red'
      message='Please, try again and if the error persists contact us.'
    />
  )
}
