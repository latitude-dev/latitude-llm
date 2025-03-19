// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { env } from '@latitude-data/env'
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // TODO: This should be the process.env.SENTRY_DSN env var
  dsn: env.SENTRY_DSN,
  enabled: env.NODE_ENV === 'production',

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
})
