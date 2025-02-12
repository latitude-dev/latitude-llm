import { env } from '@latitude-data/env'
import { PostHog } from 'posthog-node'

export function PostHogClient() {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
    return null
  }

  return new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
    host: env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  })
}
