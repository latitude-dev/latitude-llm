import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

let env
if (process.env.NODE_ENV === 'development') {
  env = await import('./env/development').then((r) => r.default)
} else if (process.env.NODE_ENV === 'test') {
  env = await import('./env/test').then((r) => r.default)
} else {
  env = process.env as {
    GATEWAY_PORT: string
    GATEWAY_HOST: string
  }
}

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    GATEWAY_PORT: z.string().optional().default('8787'),
    GATEWAY_HOST: z.string().optional().default('localhost'),
  },
  runtimeEnv: env,
})
