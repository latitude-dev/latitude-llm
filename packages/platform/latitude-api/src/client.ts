import {
  type ProductFeedbackAnnotationInput,
  type ProductFeedbackClientShape,
  ProductFeedbackRequestError,
  ProductFeedbackTransportError,
} from "@domain/product-feedback"
import { LatitudeApiClient, LatitudeApiError, LatitudeApiTimeoutError } from "@latitude-data/sdk"
import { Effect } from "effect"
import type { LatitudeApiConfig } from "./config.ts"

/**
 * `fetch` shape the SDK accepts via `LatitudeApiClient.Options.fetch`. Tests
 * pass a fake here to assert outbound request shape (URL, headers, body)
 * without touching the network.
 */
export type LatitudeApiFetch = typeof fetch

const NOOP_CLIENT: ProductFeedbackClientShape = {
  writeAnnotation: () => Effect.void,
}

/**
 * HTTP status codes in the 4xx range that are still worth retrying. 408
 * (Request Timeout) and 429 (Too Many Requests) are transient by HTTP
 * semantics — the same payload will eventually succeed once the server-side
 * condition clears, so they belong on the BullMQ-retry path instead of being
 * swallowed as permanent.
 *
 * 409 is deliberately not in this set: it's a state conflict (e.g. an
 * idempotency collision); retrying the same body reproduces the same 409.
 */
const RETRIABLE_CLIENT_ERROR_STATUSES = new Set<number>([408, 429])

const classifySdkError = (error: unknown) => {
  if (error instanceof LatitudeApiError && typeof error.statusCode === "number") {
    const message =
      typeof error.body === "object" && error.body !== null && "error" in error.body
        ? String((error.body as { error: unknown }).error)
        : error.message
    if (RETRIABLE_CLIENT_ERROR_STATUSES.has(error.statusCode)) {
      return new ProductFeedbackTransportError({ cause: error })
    }
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return new ProductFeedbackRequestError({ statusCode: error.statusCode, message })
    }
    return new ProductFeedbackTransportError({ cause: error })
  }

  if (error instanceof LatitudeApiTimeoutError) {
    return new ProductFeedbackTransportError({ cause: error })
  }

  // Network errors, abort signals, unexpected runtime errors — all retriable.
  return new ProductFeedbackTransportError({ cause: error })
}

/**
 * Builds a `ProductFeedbackClient` adapter.
 *
 * - Returns a no-op client when `config` is undefined (see `loadLatitudeApiConfig`
 *   — missing envs cleanly skip dogfood rather than erroring the worker).
 * - Otherwise wraps `@latitude-data/sdk`'s `LatitudeApiClient`: auth via
 *   `token` (Bearer), `baseUrl` from env, and translates `upstreamScoreId` into
 *   the `trace.by = "filters"` body the public API expects. See PRD §Identity
 *   strategy.
 *
 * Retry policy is deliberately left to the caller via `maxRetries`:
 * - BullMQ-driven callers (e.g. `apps/workers`) should pass `maxRetries: 0`
 *   because BullMQ owns the retry schedule — inner retries would multiply
 *   the effective budget and make backoff math meaningless.
 * - Non-queued callers (e.g. a future web-side use) should leave it
 *   unset and inherit the SDK default so transient failures don't bubble up
 *   to the user on the first blip.
 *
 * The optional `fetch` option lets callers (tests, mocked environments) inject
 * a fetch implementation without touching the real network.
 */
export const createLatitudeApiClient = (
  config: LatitudeApiConfig | undefined,
  options?: { readonly fetch?: LatitudeApiFetch; readonly maxRetries?: number },
): ProductFeedbackClientShape => {
  if (!config) return NOOP_CLIENT

  const sdk = new LatitudeApiClient({
    token: config.apiKey,
    baseUrl: config.baseUrl,
    ...(options?.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
    ...(options?.fetch !== undefined ? { fetch: options.fetch } : {}),
  })

  return {
    writeAnnotation: (input: ProductFeedbackAnnotationInput) =>
      Effect.tryPromise({
        try: async () => {
          await sdk.annotations.create(config.projectSlug, {
            trace: {
              by: "filters",
              filters: { "metadata.scoreId": [{ op: "eq", value: input.upstreamScoreId }] },
            },
            passed: input.passed,
            value: input.value,
            feedback: input.feedback,
          })
        },
        catch: classifySdkError,
      }),
  }
}
