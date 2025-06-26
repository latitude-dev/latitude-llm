import { env } from '@latitude-data/env'
import * as Sentry from '@sentry/node'

if (env.SENTRY_GATEWAY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_GATEWAY_DSN,
    enabled: !!env.SENTRY_GATEWAY_DSN,
    environment: env.NODE_ENV,
    skipOpenTelemetrySetup: true,
    tracesSampleRate: 0,
    defaultIntegrations: false,
    integrations: [],
  })
}

export const captureException = (error: Error) => {
  if (env.SENTRY_GATEWAY_DSN) {
    Sentry.captureException(error)
  } else {
    console.error(error)
  }
}

export const captureMessage = (message: string) => {
  if (env.SENTRY_GATEWAY_DSN) {
    Sentry.captureMessage(message)
  } else {
    console.log(message)
  }
}
