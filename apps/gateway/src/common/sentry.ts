import { env } from '@latitude-data/env'
import * as Sentry from '@sentry/node'

let sentry: typeof Sentry
if (!env.WORKERS) {
  sentry = Sentry
  Sentry.init({
    dsn: env.SENTRY_DSN,

    tracesSampleRate: 1.0,
  })
}

export const captureException = (error: Error) => {
  if (!sentry) return // TODO: fix this
  if (env.NODE_ENV === 'production') {
    sentry.captureException(error)
  } else {
    console.error(error)
  }
}

export const captureMessage = (message: string) => {
  if (!sentry) return // TODO: fix this
  if (env.NODE_ENV === 'production') {
    sentry.captureMessage(message)
  } else {
    console.log(message)
  }
}
