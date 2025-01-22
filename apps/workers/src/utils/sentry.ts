import { env } from '@latitude-data/env'
import * as Sentry from '@sentry/node'

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,

    tracesSampleRate: 1.0,

    enabled: env.NODE_ENV === 'production',
  })
}

export const captureException = (error: Error) => {
  if (env.NODE_ENV === 'production' && env.SENTRY_DSN) {
    Sentry.captureException(error)
  } else {
    console.error(error)
  }
}

export const captureMessage = (message: string) => {
  if (env.NODE_ENV === 'production' && env.SENTRY_DSN) {
    Sentry.captureMessage(message)
  } else {
    console.log(message)
  }
}
