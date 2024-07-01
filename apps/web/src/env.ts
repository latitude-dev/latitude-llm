import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export default createEnv({
  server: {
    DATABASE_URL: z.string(),
    TEST_DATABASE_URL: z.string(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  },
})
