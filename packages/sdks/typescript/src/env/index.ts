import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export default createEnv({
  server: {
    GATEWAY_HOSTNAME: z.string(),
    GATEWAY_PORT: z.string(),
    GATEWAY_SSL: z
      .string()
      .toLowerCase()
      .transform((x) => x === 'true')
      .pipe(z.boolean()),
  },
  runtimeEnv: {
    GATEWAY_HOSTNAME: process.env.GATEWAY_HOSTNAME ?? 'localhost',
    GATEWAY_PORT: process.env.GATEWAY_PORT ?? '8787',
    GATEWAY_SSL: process.env.GATEWAY_SSL ?? 'false',
  },
})
