import { SpanId } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_CONNECTION_TEST_EVENT_NAME, DESTINATION_EVENT_UUID_NAMESPACE } from "../constants.ts"
import type { DestinationConfig, DestinationCredentials } from "../entities/destination.ts"
import type { DestinationEvent } from "../entities/destination-event.ts"
import { isRetryableDeliveryError } from "../errors.ts"
import { uuidV5 } from "../helpers.ts"
import { DestinationDeliverers } from "../ports/destination-deliverer.ts"

const CANARY_DISTINCT_ID = "latitude-connection-test"
const CANARY_SPAN_ID = SpanId("connection-test")

export interface TestDestinationConnectionInput {
  readonly config: DestinationConfig
  readonly credentials: DestinationCredentials
}

/**
 * Outcome of a pre-save connection test. Known limits the UI (P2-2) must surface
 * to the user:
 *
 * - PostHog `phc_` keys are **write-only**: a valid key scoped to the WRONG
 *   project still returns `ok` here and silently sends the canary to that other
 *   project. The test proves reachability + key acceptance, NOT project identity.
 * - The canary event (`latitude_connection_test`) is delivered for real and is
 *   visible in the customer's PostHog project.
 */
export type TestDestinationConnectionResult =
  | { readonly status: "ok" }
  | {
      readonly status: "failed"
      /** Transient failure (transport, 5xx, 429): retrying may succeed. `false` means fix the config/key. */
      readonly retryable: boolean
      /** Sanitized adapter taxonomy (e.g. `invalid_api_key`), never an upstream response body. */
      readonly reason: string
      readonly upstreamStatus?: number
    }

const buildCanaryEvent = (config: DestinationConfig): Effect.Effect<DestinationEvent> =>
  Effect.gen(function* () {
    const uuid = yield* Effect.promise(() =>
      uuidV5({ namespace: DESTINATION_EVENT_UUID_NAMESPACE, name: `connection-test:${config.host}` }),
    )
    return {
      uuid,
      name: DESTINATION_CONNECTION_TEST_EVENT_NAME,
      distinctId: CANARY_DISTINCT_ID,
      timestamp: new Date(),
      spanId: CANARY_SPAN_ID,
      properties: { latitude_connection_test: true },
    }
  })

/**
 * Tests a destination before saving by delivering a single canary event through
 * the kind's deliverer and mapping the adapter's retryable/non-retryable errors
 * to a {@link TestDestinationConnectionResult}. The window ends now, so the
 * adapter never flags the canary as a historical migration.
 */
export const testDestinationConnectionUseCase = (input: TestDestinationConnectionInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("kind", input.config.kind)

    const deliverers = yield* DestinationDeliverers
    const deliverer = deliverers[input.config.kind]
    const canary = yield* buildCanaryEvent(input.config)

    return yield* deliverer
      .deliver([canary], input.config, input.credentials, {
        window: { start: canary.timestamp, end: canary.timestamp },
      })
      .pipe(
        Effect.match({
          onSuccess: (): TestDestinationConnectionResult => ({ status: "ok" }),
          onFailure: (error): TestDestinationConnectionResult => ({
            status: "failed",
            retryable: isRetryableDeliveryError(error),
            reason: error.reason,
            ...(error.upstreamStatus === undefined ? {} : { upstreamStatus: error.upstreamStatus }),
          }),
        }),
      )
  }).pipe(Effect.withSpan("destinations.testDestinationConnection")) as Effect.Effect<
    TestDestinationConnectionResult,
    never,
    DestinationDeliverers
  >
