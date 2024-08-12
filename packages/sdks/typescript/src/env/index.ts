import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

import development from './enviroments/development'
import test from './enviroments/test'

let env
if (process.env.NODE_ENV === 'development') {
  env = development
} else if (process.env.NODE_ENV === 'test') {
  env = test
} else {
  env = process.env as {
    BASE_URL: string
  }
}

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    BASE_PATH: z.string(),
    HTTPS: z.boolean(),
  },
  runtimeEnv: env,
})
