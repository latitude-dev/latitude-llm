import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    NODE_ENV: z.string(),
    DATABASE_URL: z.string(),
    GATEWAY_HOSTNAME: z.string(),
    GATEWAY_PORT: z.coerce.number().optional(),
    GATEWAY_SSL: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
      .default('true'),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    GATEWAY_HOSTNAME: process.env.GATEWAY_HOSTNAME,
    GATEWAY_PORT: process.env.GATEWAY_PORT,
    GATEWAY_SSL: process.env.GATEWAY_SSL,
  },
})
