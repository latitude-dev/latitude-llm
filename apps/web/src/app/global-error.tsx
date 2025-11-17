'use client'

import { useEffect } from 'react'

import { fontMono, fontSans, fontDisplay } from '$/helpers/fonts'
import { captureClientError } from '$/instrumentation-client'
import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ErrorComponent } from '@latitude-data/web-ui/browser'
import Link from 'next/link'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    captureClientError(error, {
      component: 'GlobalError',
      digest: error.digest,
    })
  }, [error])

  return (
    <html lang='en' suppressHydrationWarning className='w-full h-full'>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.svg' />
      </head>
      <body
        className={`w-full h-full ${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} font-sans`}
      >
        <ErrorComponent
          message={error.message}
          type='red'
          submit={
            <Link href={ROUTES.root}>
              <Button
                variant='link'
                iconProps={{ name: 'arrowRight', placement: 'right' }}
                className='p-0'
              >
                Go back to the homepage
              </Button>
            </Link>
          }
        />
      </body>
    </html>
  )
}
