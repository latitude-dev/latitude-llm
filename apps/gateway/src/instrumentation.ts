import { env } from '@latitude-data/env'
import { VercelBatchSpanProcessor } from '@latitude-data/telemetry'
import { Latitude } from '@latitude-data/sdk'

export const latitude = env.COPILOT_WORKSPACE_API_KEY
  ? new Latitude(env.COPILOT_WORKSPACE_API_KEY, {
      telemetry: {
        processors: [VercelBatchSpanProcessor],
      },
    })
  : undefined
