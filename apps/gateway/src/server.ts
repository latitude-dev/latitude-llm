import { serve } from '@hono/node-server'

import app from '.'
import env from './common/env'

serve(
  {
    fetch: app.fetch,
    overrideGlobalObjects: undefined,
    port: Number(env.GATEWAY_PORT),
    hostname: env.GATEWAY_HOST,
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port}`)
  },
)
