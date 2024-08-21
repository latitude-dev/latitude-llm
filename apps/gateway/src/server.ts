import { serve } from '@hono/node-server'
import env from '$/common/env'
import app from '$/routes/app'

serve(
  {
    fetch: app.fetch,
    overrideGlobalObjects: undefined,
    port: env.GATEWAY_PORT,
    hostname: env.GATEWAY_HOSTNAME,
  },
  (info) => {
    console.log(`Listening on http://${env.GATEWAY_HOSTNAME}:${info.port}`)
  },
)
