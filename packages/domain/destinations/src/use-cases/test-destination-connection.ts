import { Effect } from "effect"
import type { DestinationConfig, DestinationCredentials } from "../entities/destination.ts"
import { isRetryableDeliveryError } from "../errors.ts"
import { DestinationDeliverers } from "../ports/destination-deliverer.ts"

export interface TestDestinationConnectionInput {
  readonly config: DestinationConfig
  readonly credentials: DestinationCredentials
}

/**
 * Outcome of a pre-save connection probe. The deliverer validates the key
 * against an endpoint that authenticates it (no telemetry is sent), so an
 * accepted key is one that maps to a real project — the only residual
 * ambiguity is whether it's the project the user intended.
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

/**
 * Tests a destination before saving by probing the kind's deliverer and mapping
 * the adapter's retryable/non-retryable errors to a {@link TestDestinationConnectionResult}.
 */
export const testDestinationConnectionUseCase = (input: TestDestinationConnectionInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("kind", input.config.kind)

    const deliverers = yield* DestinationDeliverers
    const deliverer = deliverers[input.config.kind]

    return yield* deliverer.testConnection(input.config, input.credentials).pipe(
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
