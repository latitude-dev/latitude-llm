import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    DATABASE_URL: z.string(),
    REDIS_HOST: z.string(),
    REDIS_PORT: z.string(),
    REDIS_PASSWORD: z.string().optional(),
    GATEWAY_HOSTNAME: z.string(),
    GATEWAY_PORT: z.string(),
    GATEWAY_SSL: z
      .string()
      .toLowerCase()
      .transform((x) => x === 'true')
      .pipe(z.boolean()),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    GATEWAY_HOSTNAME: process.env.GATEWAY_HOSTNAME,
    GATEWAY_PORT: process.env.GATEWAY_PORT,
    GATEWAY_SSL: process.env.GATEWAY_SSL,
  },
})
