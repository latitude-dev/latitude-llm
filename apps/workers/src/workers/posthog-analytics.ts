import type { QueueConsumer } from "@domain/queue"
import { mapEventToPostHog, mapOrganizationGroupIdentify, type PostHogClientShape } from "@platform/analytics-posthog"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect } from "effect"
import { getPostHogClient } from "../clients.ts"

const logger = createLogger("posthog-analytics")

class PostHogCaptureError extends Data.TaggedError("PostHogCaptureError")<{
  readonly cause: unknown
}> {}

interface PostHogAnalyticsDeps {
  consumer: QueueConsumer
  /** Injected in tests; defaults to the memoized workers client. */
  posthog?: PostHogClientShape
}

export const createPostHogAnalyticsWorker = ({ consumer, posthog }: PostHogAnalyticsDeps) => {
  const client = posthog ?? getPostHogClient()

  consumer.subscribe("posthog-analytics", {
    track: (payload) =>
      Effect.tryPromise({
        try: async () => {
          const mapped = mapEventToPostHog(payload)
          // Defense-in-depth: if the upstream whitelist filter regresses and an
          // untracked event reaches us, skip rather than emit garbage.
          if (!mapped) return

          await client.capture(mapped)

          // On the first OrganizationCreated we see for an org, also
          // groupIdentify so the org has name/slug in PostHog's UI. Idempotent.
          if (payload.eventName === "OrganizationCreated") {
            const identify = mapOrganizationGroupIdentify(
              payload.payload as {
                readonly organizationId: string
                readonly actorUserId: string
                readonly name: string
                readonly slug: string
              },
            )
            await client.groupIdentify(identify)
          }
        },
        catch: (cause) => new PostHogCaptureError({ cause }),
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`posthog capture failed for ${payload.eventName}`, error)),
        ),
        // Analytics must never poison the queue. A prolonged outage surfaces
        // via the error logs above.
        Effect.ignore,
        withTracing,
      ),
  })
}
