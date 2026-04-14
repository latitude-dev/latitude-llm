import { PostHog } from "posthog-node"
import type { PostHogConfig } from "./config.ts"

/**
 * Shape callers use to capture events. Mirrors posthog-node's relevant surface
 * area so we can swap for a no-op when config is absent.
 */
export interface PostHogCaptureInput {
  readonly distinctId: string
  readonly event: string
  readonly properties?: Record<string, unknown>
  readonly groups?: Record<string, string>
  readonly timestamp?: Date
}

export interface PostHogGroupIdentifyInput {
  readonly groupType: string
  readonly groupKey: string
  readonly properties?: Record<string, unknown>
}

export interface PostHogClientShape {
  readonly capture: (input: PostHogCaptureInput) => Promise<void>
  readonly groupIdentify: (input: PostHogGroupIdentifyInput) => Promise<void>
  readonly shutdown: () => Promise<void>
}

const NOOP_CLIENT: PostHogClientShape = {
  capture: () => Promise.resolve(),
  groupIdentify: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
}

/**
 * Returns a real PostHog client when config is present, or a no-op otherwise.
 * Local dev and self-hosted deployments typically run without the env var —
 * callers should neither check nor care which one they got.
 */
export const createPostHogClient = (config: PostHogConfig | undefined): PostHogClientShape => {
  if (!config) return NOOP_CLIENT

  const client = new PostHog(config.apiKey, {
    host: config.host,
    // Backend events are already persisted via the outbox + BullMQ before we get
    // here, so an in-process PostHog buffer does not need to re-cover that
    // durability. Small batch + short flush interval keeps worker memory bounded
    // and makes shutdown flush quick.
    flushAt: 20,
    flushInterval: 10_000,
  })

  return {
    capture: async (input) => {
      // exactOptionalPropertyTypes requires omitting undefined fields rather
      // than assigning them.
      client.capture({
        distinctId: input.distinctId,
        event: input.event,
        ...(input.properties !== undefined ? { properties: input.properties } : {}),
        ...(input.groups !== undefined ? { groups: input.groups } : {}),
        ...(input.timestamp !== undefined ? { timestamp: input.timestamp } : {}),
      })
    },
    groupIdentify: async (input) => {
      client.groupIdentify({
        groupType: input.groupType,
        groupKey: input.groupKey,
        ...(input.properties !== undefined ? { properties: input.properties } : {}),
      })
    },
    shutdown: () => client.shutdown(),
  }
}
