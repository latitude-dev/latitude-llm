'use client'

import { useEffect } from 'react'

import { Button } from '@latitude-data/web-ui'
import { ErrorComponent } from '@latitude-data/web-ui/browser'
import * as Sentry from '@sentry/nextjs'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <ErrorComponent
          message={error.message}
          type='red'
          submit={
            <Link href={ROUTES.root}>
              <Button>Go back to homepage</Button>
            </Link>
          }
        />
      </body>
    </html>
  )
}
