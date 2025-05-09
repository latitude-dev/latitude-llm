import * as Sentry from '@sentry/node'
import { env } from '@latitude-data/env'

let sentry: Sentry.NodeClient | undefined

const initSentry = () => {
  if (env.SENTRY_WORKERS_DSN) {
    return Sentry.init({
      dsn: env.SENTRY_WORKERS_DSN,
      enabled: !!env.SENTRY_WORKERS_DSN,
      environment: env.NODE_ENV,
      integrations: [],
      defaultIntegrations: false,
    })
  }
}

export const captureException = (error: Error) => {
  if (!sentry) sentry = initSentry()

  if (sentry) {
    sentry?.captureException(error)
  } else {
    console.error(error)
  }
}

export const captureMessage = (message: string) => {
  if (!sentry) sentry = initSentry()

  if (sentry) {
    sentry?.captureMessage(message)
  } else {
    console.log(message)
  }
}
