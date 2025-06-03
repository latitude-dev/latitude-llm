import * as Sentry from '@sentry/nextjs'
import { env } from '@latitude-data/env'

export const captureException = (error: Error) => {
  if (env.SENTRY_WEB_DSN) {
    Sentry.captureException(error)
  } else {
    if (env.NODE_ENV !== 'test') {
      console.log(error)
    }
  }
}

export const captureMessage = (message: string) => {
  if (env.SENTRY_WEB_DSN) {
    Sentry.captureMessage(message)
  } else {
    console.log(message)
  }
}
