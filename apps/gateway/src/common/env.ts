import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const isDev = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'

let localEnv = {}
if (isDev || isTest) {
  localEnv = {
    HOSTNAME: 'localhost',
    PORT: isTest ? '8788' : '8787',
  }
}

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    DATABASE_URL: z.string(),
    HOSTNAME: z.string().default('localhost'),
    PORT: z.coerce.number(),
  },
  runtimeEnv: {
    ...process.env,
    ...localEnv,
  },
})
