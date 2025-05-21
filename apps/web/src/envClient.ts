import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

const EMAIL_TRIGGER_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_TRIGGER_DOMAIN

export const envClient = createEnv({
  client: {
    NEXT_PUBLIC_POSTHOG_KEY: z.string(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string(),
    NEXT_PUBLIC_DEFAULT_PROVIDER_NAME: z.string(),
    NEXT_PUBLIC_EMAIL_TRIGGER_DOMAIN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_WEB_DSN: z.string().optional(),
    NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL: z.string(),
    NEXT_PUBLIC_DOCS_URL: z.string(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL:
      process.env.NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL ?? '',
    NEXT_PUBLIC_DEFAULT_PROVIDER_NAME: 'Latitude',
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '',
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
    NEXT_PUBLIC_EMAIL_TRIGGER_DOMAIN: EMAIL_TRIGGER_DOMAIN ?? '',
    NEXT_PUBLIC_SENTRY_WEB_DSN: process.env.NEXT_PUBLIC_SENTRY_WEB_DSN ?? '',
    NEXT_PUBLIC_DOCS_URL:
      process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.latitude.so',
  },
})
