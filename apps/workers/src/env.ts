import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    DATABASE_URL: z.string(),
    QUEUE_HOST: z.string(),
    QUEUE_PORT: z.coerce.number().optional(),
    QUEUE_PASSWORD: z.string().optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    QUEUE_HOST: process.env.QUEUE_HOST,
    QUEUE_PORT: process.env.QUEUE_PORT,
    QUEUE_PASSWORD: process.env.QUEUE_PASSWORD,
  },
})
