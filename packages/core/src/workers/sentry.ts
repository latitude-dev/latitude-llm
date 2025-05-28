import * as Sentry from '@sentry/node'
import { env } from '@latitude-data/env'

let sentry: Sentry.NodeClient | undefined

export const initSentry = () => {
  if (sentry) return sentry

  if (env.SENTRY_WORKERS_DSN) {
    sentry = Sentry.init({
      dsn: env.SENTRY_WORKERS_DSN,
      enabled: !!env.SENTRY_WORKERS_DSN,
      environment: env.NODE_ENV,
      integrations: [],
      defaultIntegrations: false,
    })

    return sentry
  }
}

export const captureException = (error: Error) => {
  const s = initSentry()

  if (s) {
    s?.captureException(error)
  } else {
    console.error(error)
  }
}

export const captureMessage = (message: string) => {
  const s = initSentry()

  if (s) {
    s?.captureMessage(message)
  } else {
    console.log(message)
  }
}
