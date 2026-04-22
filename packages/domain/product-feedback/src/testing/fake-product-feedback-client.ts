import { Effect } from "effect"
import { ProductFeedbackRequestError, ProductFeedbackTransportError } from "../errors.ts"
import type { ProductFeedbackAnnotationInput, ProductFeedbackClientShape } from "../ports/product-feedback-client.ts"

/**
 * In-memory `ProductFeedbackClient` for unit tests. Collects every payload
 * handed to `writeAnnotation` so assertions can inspect the outbound shape
 * without a real HTTP boundary.
 *
 * Pass an override to simulate failures:
 *
 * ```ts
 * createFakeProductFeedbackClient({
 *   fail: { kind: "transport", cause: "network" },
 * })
 * ```
 */
export interface FakeProductFeedbackClient {
  readonly client: ProductFeedbackClientShape
  readonly writes: ProductFeedbackAnnotationInput[]
}

type FakeFailure =
  | { readonly kind: "transport"; readonly cause: unknown }
  | { readonly kind: "request"; readonly statusCode: number; readonly message: string }

export const createFakeProductFeedbackClient = (options?: {
  readonly fail?: FakeFailure
}): FakeProductFeedbackClient => {
  const writes: ProductFeedbackAnnotationInput[] = []

  const client: ProductFeedbackClientShape = {
    writeAnnotation: (input) =>
      Effect.gen(function* () {
        writes.push(input)

        if (options?.fail?.kind === "transport") {
          return yield* new ProductFeedbackTransportError({ cause: options.fail.cause })
        }

        if (options?.fail?.kind === "request") {
          return yield* new ProductFeedbackRequestError({
            statusCode: options.fail.statusCode,
            message: options.fail.message,
          })
        }
      }),
  }

  return { client, writes }
}
