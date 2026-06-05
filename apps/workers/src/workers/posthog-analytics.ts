import { consumeSignupAttribution, type MarketingAttribution, stackChoiceToOnboardingType } from "@domain/marketing"
import { MembershipRepository } from "@domain/organizations"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { mapEventToPostHog, mapOrganizationGroupIdentify, type PostHogClientShape } from "@platform/analytics-posthog"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { MembershipRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect } from "effect"
import { getPostgresClient, getPostHogClient, getRedisClient } from "../clients.ts"

const logger = createLogger("posthog-analytics")

class PostHogCaptureError extends Data.TaggedError("PostHogCaptureError")<{
  readonly cause: unknown
}> {}

/**
 * Resolves the org owner's user id so owner-less system events
 * (`FirstTraceReceived`, fired off API-key ingestion) can be attributed to a
 * real user. That keeps them IDENTIFIED in PostHog — anonymous events don't get
 * a materialized `$group_0`, which org-level retention / funnels join on.
 *
 * Best-effort: a failure (or no owner) resolves to `null`, leaving the event
 * org-scoped. The lookup lives here, not in the ingest hot path that emits the
 * event, so other consumers don't pay for it.
 */
const resolveOrgOwnerUserId = (organizationId: string): Promise<string | null> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* MembershipRepository
      const owner = yield* repo.findFirstOwner(OrganizationId(organizationId))
      return owner?.userId ?? null
    }).pipe(
      withPostgres(MembershipRepositoryLive, getPostgresClient(), OrganizationId(organizationId)),
      Effect.orElseSucceed(() => null),
    ),
  )

/**
 * Reads the browser attribution stashed at magic-link request time (keyed by
 * email) so it can ride onto the `UserSignedUp` capture. Best-effort: any failure
 * resolves to `{}` so attribution never blocks the capture itself.
 */
const consumeSignupAttributionDefault = (email: string): Promise<MarketingAttribution> =>
  Effect.runPromise(
    consumeSignupAttribution({ email }).pipe(Effect.provide(RedisCacheStoreLive(getRedisClient()))),
  ).catch(() => ({}))

interface PostHogAnalyticsDeps {
  consumer: QueueConsumer
  /** Injected in tests; defaults to the memoized workers client. */
  posthog?: PostHogClientShape
  /** Injected in tests; defaults to a Membership lookup against Postgres. */
  resolveOwnerUserId?: (organizationId: string) => Promise<string | null>
  /** Injected in tests; defaults to reading the Redis-stashed signup attribution. */
  consumeAttribution?: (email: string) => Promise<MarketingAttribution>
}

export const createPostHogAnalyticsWorker = ({
  consumer,
  posthog,
  resolveOwnerUserId,
  consumeAttribution,
}: PostHogAnalyticsDeps) => {
  const client = posthog ?? getPostHogClient()
  const resolveOwner = resolveOwnerUserId ?? resolveOrgOwnerUserId
  const consumeSignupAttr = consumeAttribution ?? consumeSignupAttributionDefault

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

          // FirstTraceReceived has no acting user (API-key ingestion). Attribute
          // it to the org owner so PostHog keeps it identified and materializes
          // `$group_0`. Falls back to org-scoped/anonymous when there's no owner.
          let input = payload
          if (payload.eventName === "FirstTraceReceived") {
            const ownerUserId = await resolveOwner(payload.organizationId)
            if (ownerUserId) {
              input = { ...payload, payload: { ...payload.payload, actorUserId: ownerUserId } }
            }
          }

          // UserSignedUp carries no browser context (it's emitted server-side).
          // The login flow stashes the PostHog session + referrer/UTM in Redis
          // keyed by email; merge it onto the payload so `$session_id` links this
          // capture to the browser session (→ `$entry_current_url`).
          if (payload.eventName === "UserSignedUp") {
            const { email } = payload.payload as { readonly userId: string; readonly email: string }
            const attribution = await consumeSignupAttr(email)
            if (Object.keys(attribution).length > 0) {
              input = { ...payload, payload: { ...payload.payload, ...attribution } }
            }
          }

          const mapped = mapEventToPostHog(input)
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
