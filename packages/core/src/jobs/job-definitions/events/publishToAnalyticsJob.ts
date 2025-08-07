import { env } from '@latitude-data/env'
import type { Job } from 'bullmq'

import type { LatitudeEvent } from '../../../events/events'
import { AnalyticsClient } from '../../../lib/analytics/AnalyticsClient'
import { PosthogProvider } from '../../../lib/analytics/providers/Posthog'

export const publishToAnalyticsJob = async (job: Job<LatitudeEvent>) => {
  const event = job.data
  const client = new AnalyticsClient({
    provider: new PosthogProvider(),
    event,
    env: {
      nodeEnv: env.NODE_ENV,
      appDomain: env.APP_DOMAIN,
      isCloud: env.LATITUDE_CLOUD,
      optOutAnalytics: env.OPT_OUT_ANALYTICS,
    },
  })

  await client.capture()
}
