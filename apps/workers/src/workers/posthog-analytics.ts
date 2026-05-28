import { stackChoiceToOnboardingType } from "@domain/marketing"
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
          // Set onboardingType as a person property so it retroactively applies
          // to UserSignedUp and all other past events for this user in PostHog.
          // Runs before the whitelist check — this event isn't captured, only
          // used to enrich the person profile.
          if (payload.eventName === "UserOnboardingCompleted") {
            const p = payload.payload as {
              readonly userId: string
              readonly stackChoice: "coding-agent-machine" | "production-agent"
            }
            await client.personIdentify({
              distinctId: p.userId,
              properties: { onboardingType: stackChoiceToOnboardingType(p.stackChoice) },
            })
            return
          }

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

          // Explicitly identify the person on signup so their email is set on
          // the PostHog person profile immediately — without waiting for the
          // frontend posthog.identify() call that only fires on web app load.
          if (payload.eventName === "UserSignedUp") {
            const p = payload.payload as { readonly userId: string; readonly email: string }
            await client.personIdentify({ distinctId: p.userId, properties: { email: p.email } })
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
