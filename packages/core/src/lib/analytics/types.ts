import { PostHog } from 'posthog-node'
export type PostHogInstance = InstanceType<typeof PostHog>

export type AnalyticsEnvironment = {
  nodeEnv: string
  appDomain: string
  optOutAnalytics: boolean
  isCloud: boolean
}
