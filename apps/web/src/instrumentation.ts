import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Sentry
    await import('../sentry.server.config')

    if (process.env.DD_TRACING_ENABLED === 'true') {
      // Datadog
      await import('./tracer')
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Sentry
    await import('../sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
