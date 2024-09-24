import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

let GATEWAY_HOSTNAME, GATEWAY_PORT, GATEWAY_SSL
if (process.env.NODE_ENV === 'development') {
  GATEWAY_HOSTNAME = 'localhost'
  GATEWAY_PORT = '8787'
  GATEWAY_SSL = 'false'
} else {
  GATEWAY_HOSTNAME = 'gateway.latitude.so'
  GATEWAY_SSL = 'true'
}

export default createEnv({
  server: {
    GATEWAY_HOSTNAME: z.string(),
    GATEWAY_PORT: z.coerce.number().optional(),
    GATEWAY_SSL: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true'),
  },
  runtimeEnv: {
    GATEWAY_HOSTNAME,
    GATEWAY_PORT,
    GATEWAY_SSL,
  },
})
