import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    NODE_ENV: z.string(),
    DATABASE_URL: z.string(),
    WEBSOCKETS_SERVER: z.string(),
    SUPPORT_APP_ID: z.string(),
    SUPPORT_APP_SECRET_KEY: z.string(),
    LATITUDE_CLOUD: z.boolean(),
    LATITUDE_CLOUD_PAYMENT_URL: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    WEBSOCKETS_SERVER: process.env.WEBSOCKETS_SERVER,
    SUPPORT_APP_ID: process.env.SUPPORT_APP_ID ?? '',
    SUPPORT_APP_SECRET_KEY: process.env.SUPPORT_APP_SECRET_KEY ?? '',
    LATITUDE_CLOUD: process.env.LATITUDE_CLOUD === 'true',
    LATITUDE_CLOUD_PAYMENT_URL: process.env.LATITUDE_CLOUD_PAYMENT_URL,
    SENTRY_DSN: process.env.SENTRY_DSN,
  },
})
