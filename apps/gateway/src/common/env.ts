import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

let localEnv = {}
if (process.env.NODE_ENV === 'development') {
  localEnv = await import('./env/development').then((r) => r.default)
} else if (process.env.NODE_ENV === 'test') {
  localEnv = await import('./env/test').then((r) => r.default)
}

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    GATEWAY_PORT: z.string().optional().default('8787'),
    GATEWAY_HOST: z.string().optional().default('localhost'),
    REDIS_HOST: z.string(),
    REDIS_PORT: z.string(),
    REDIS_PASSWORD: z.string().optional(),
  },
  runtimeEnv: {
    ...process.env,
    ...localEnv,
  },
})
