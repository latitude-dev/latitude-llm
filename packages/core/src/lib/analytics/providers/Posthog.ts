import { PostHog } from 'posthog-node'
import type { AnalyticsProvider } from './AnalyticsProvider'
import type { CollectorOutput, ProductEdition } from '../collectors/DataCollector'

const POSTHOG_KEY = 'phc_4R5q3ZzjJ3biZ9SandlYXn5SceEa5KoKeQ7u4hsW8vF'
const POSTHOG_HOST = 'https://eu.i.posthog.com'

export class PosthogProvider implements AnalyticsProvider {
  private posthog: PostHog

  constructor() {
    this.posthog = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  }

  async capture(data: CollectorOutput<ProductEdition>): Promise<void> {
    const { distinctId, event, properties } = data

    this.posthog.capture({
      distinctId,
      event,
      properties,
    })
    await this.posthog.shutdown()
  }
}
