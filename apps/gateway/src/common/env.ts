import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const isDev = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'
const hasHardcodedEnv = isDev || isTest

let localEnv = {}
if (hasHardcodedEnv) {
  localEnv = {
    GATEWAY_HOSTNAME: 'localhost',
    GATEWAY_PORT: isTest ? '8788' : '8787',
  }
}

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    DATABASE_URL: z.string(),
    REDIS_HOST: z.string(),
    REDIS_PORT: z.coerce.number().optional(),
    REDIS_PASSWORD: z.string().optional(),
    GATEWAY_HOSTNAME: z.string().optional().default('localhost'),
    GATEWAY_PORT: z.coerce.number().optional(),
  },
  runtimeEnv: {
    ...process.env,
    ...localEnv,
  },
})
