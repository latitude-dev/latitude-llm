// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // TODO: This should be the process.env.SENTRY_DSN env var
  dsn: 'https://6e31ecebeab94c81ef6be3b0b8ab5773@o1153048.ingest.us.sentry.io/4507922531418112',

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  tracesSampleRate: 1.0,
})
