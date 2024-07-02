import 'dotenv/config'

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export default createEnv({
  server: {
    DATABASE_URL: z.string(),
    TEST_DATABASE_URL: z.string(),
    ELASTIC_URL: z.string(),
    ELASTIC_USERNAME: z.string(),
    ELASTIC_PASSWORD: z.string(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    ELASTIC_URL: process.env.ELASTIC_URL,
    ELASTIC_USERNAME: process.env.ELASTIC_USERNAME,
    ELASTIC_PASSWORD: process.env.ELASTIC_PASSWORD,
  },
})
