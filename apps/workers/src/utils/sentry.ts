import * as Sentry from '@sentry/node'
import { env } from '@latitude-data/env'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

if (env.SENTRY_WORKERS_DSN) {
  Sentry.init({
    dsn: env.SENTRY_WORKERS_DSN,
    enabled: !!env.SENTRY_WORKERS_DSN,
    integrations: [nodeProfilingIntegration],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,

    environment: env.NODE_ENV,
  })
}

export const captureException = (error: Error) => {
  if (env.SENTRY_WORKERS_DSN) {
    Sentry.captureException(error)
  } else {
    console.error(error)
  }
}

export const captureMessage = (message: string) => {
  if (env.SENTRY_WORKERS_DSN) {
    Sentry.captureMessage(message)
  } else {
    console.log(message)
  }
}
