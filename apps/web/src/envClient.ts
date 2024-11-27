import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

const APP_DOMAIN =
  process.env.NODE_ENV === 'production'
    ? 'https://app.latitude.so'
    : 'http://localhost:3000'
export const envClient = createEnv({
  client: {
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_APP_DOMAIN: z.string(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string(),
    NEXT_PUBLIC_DEFAULT_PROJECT_ID: z.string(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_DOMAIN: APP_DOMAIN,
    NEXT_PUBLIC_DEFAULT_PROJECT_ID: 'Latitude', // TODO: consolidate with the same env var in packages/env
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '',
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN,
  },
})
