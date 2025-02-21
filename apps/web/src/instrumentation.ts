import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Sentry
    await import('../sentry.server.config')

    if (process.env.NODE_ENV === 'production') {
      // Stdout logging
      await import('pino')
      await import('next-logger')
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Sentry
    await import('../sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
