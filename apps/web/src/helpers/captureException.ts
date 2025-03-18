import * as Sentry from '@sentry/nextjs'
import { env } from '@latitude-data/env'

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
