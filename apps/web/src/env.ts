import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export default createEnv({
  skipValidation: process.env.BUILDING_CONTAINER == 'true',
  server: {
    DATABASE_URL: z.string(),
    REDIS_HOST: z.string(),
    REDIS_PORT: z.string(),
    REDIS_PASSWORD: z.string().optional(),
    ELASTIC_URL: z.string(),
    ELASTIC_USERNAME: z.string(),
    ELASTIC_PASSWORD: z.string(),
    LATITUDE_API_KEY: z.string(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    ELASTIC_URL: process.env.ELASTIC_URL,
    ELASTIC_USERNAME: process.env.ELASTIC_USERNAME,
    ELASTIC_PASSWORD: process.env.ELASTIC_PASSWORD,
    LATITUDE_API_KEY: process.env.LATITUDE_API_KEY,
  },
})
