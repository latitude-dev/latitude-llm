import { env } from '@latitude-data/env'
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

if (env.SENTRY_GATEWAY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_GATEWAY_DSN,
    enabled: !!env.SENTRY_GATEWAY_DSN,
    environment: env.NODE_ENV,
    integrations: [nodeProfilingIntegration()],
    profilesSampleRate: 1.0,
    tracesSampleRate: 1.0,
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
