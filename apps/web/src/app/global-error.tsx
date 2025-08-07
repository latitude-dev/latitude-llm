'use client'

import { useEffect } from 'react'

import { fontMono, fontSans } from '$/helpers/fonts'
import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ErrorComponent } from '@latitude-data/web-ui/browser'
import * as Sentry from '@sentry/nextjs'
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
    <html lang='en' suppressHydrationWarning>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.svg' />
      </head>
      <body className={`${fontSans.variable} ${fontMono.variable} font-sans`}>
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
