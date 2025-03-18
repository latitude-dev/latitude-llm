import { env } from '@latitude-data/env'
import * as Sentry from '@sentry/node'

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,

    enabled: !!env.SENTRY_DSN,
  })
}

export const captureException = (error: Error) => {
  if (env.SENTRY_DSN) {
    Sentry.captureException(error)
  } else {
    console.error(error)
  }
}

export const captureMessage = (message: string) => {
  if (env.SENTRY_DSN) {
    Sentry.captureMessage(message)
  } else {
    console.log(message)
  }
}
