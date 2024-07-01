import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export default createEnv({
  server: {
    DATABASE_URL: z.string(),
    TEST_DATABASE_URL: z.string(),
    API_KEY: z.string(),
    ELASTIC_USERNAME: z.string(),
    ELASTIC_PASSWORD: z.string(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    API_KEY: process.env.API_KEY,
    ELASTIC_USERNAME: process.env.ELASTIC_USERNAME,
    ELASTIC_PASSWORD: process.env.ELASTIC_PASSWORD
  },
})
