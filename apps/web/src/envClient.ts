import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

const EMAIL_TRIGGER_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_TRIGGER_DOMAIN

export const envClient = createEnv({
  client: {
    NEXT_PUBLIC_POSTHOG_KEY: z.string(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string(),
    NEXT_PUBLIC_DEFAULT_PROVIDER_NAME: z.string(),
    NEXT_PUBLIC_EMAIL_TRIGGER_DOMAIN: z.string().optional(),
    NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL: z.string(),
    NEXT_PUBLIC_DOCS_URL: z.string(),
    NEXT_PUBLIC_DATADOG_APPLICATION_ID: z.string().optional(),
    NEXT_PUBLIC_DATADOG_CLIENT_TOKEN: z.string().optional(),
    NEXT_PUBLIC_DATADOG_SITE: z.string().optional(),
    NEXT_PUBLIC_NODE_ENV: z.string().optional(),
    NEXT_PUBLIC_RELEASE_VERSION: z.string().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL:
      process.env.NEXT_PUBLIC_LATITUDE_CLOUD_PAYMENT_URL ?? '',
    NEXT_PUBLIC_DEFAULT_PROVIDER_NAME: 'Latitude',
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '',
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
    NEXT_PUBLIC_EMAIL_TRIGGER_DOMAIN: EMAIL_TRIGGER_DOMAIN ?? '',
    NEXT_PUBLIC_DOCS_URL:
      process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.latitude.so',
    NEXT_PUBLIC_DATADOG_APPLICATION_ID:
      process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID ?? '',
    NEXT_PUBLIC_DATADOG_CLIENT_TOKEN:
      process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN ?? '',
    NEXT_PUBLIC_DATADOG_SITE:
      process.env.NEXT_PUBLIC_DATADOG_SITE ?? 'datadoghq.eu',
    NEXT_PUBLIC_NODE_ENV: process.env.NODE_ENV ?? 'development',
    NEXT_PUBLIC_RELEASE_VERSION: process.env.RELEASE_VERSION ?? '',
  },
})
