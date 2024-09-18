import { env } from '@latitude-data/env'
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: env.SENTRY_DSN,

  tracesSampleRate: 1.0,
})

export const captureException = (error: Error) => {
  if (env.NODE_ENV === 'production') {
    Sentry.captureException(error)
  } else {
    console.error(error)
  }
}

export const captureMessage = (message: string) => {
  if (env.NODE_ENV === 'production') {
    Sentry.captureMessage(message)
  } else {
    console.log(message)
  }
}
