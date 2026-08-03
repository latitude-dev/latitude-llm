import { verifyHmacSha256Hex } from "@repo/utils"
import { Effect } from "effect"
import { InvalidGithubSignatureError } from "./errors.ts"

const SIGNATURE_PREFIX = "sha256="

/**
 * Verifies an inbound GitHub App webhook against the app secret per
 * https://docs.github.com/webhooks/using-webhooks/validating-webhook-deliveries.
 * `X-Hub-Signature-256` is `sha256=<hex>` of the HMAC-SHA256 over the raw
 * request body. GitHub does not sign a timestamp, so (unlike Slack) there is no
 * replay window — delivery idempotency is enforced by the `X-GitHub-Delivery`
 * GUID at the worker.
 */
export const verifyGithubSignature = (input: {
  readonly secret: string
  readonly signature: string | null | undefined
  readonly body: string
}): Effect.Effect<void, InvalidGithubSignatureError> =>
  Effect.gen(function* () {
    if (!input.signature) {
      return yield* Effect.fail(new InvalidGithubSignatureError({ reason: "missing" }))
    }
    if (!input.signature.startsWith(SIGNATURE_PREFIX)) {
      return yield* Effect.fail(new InvalidGithubSignatureError({ reason: "format" }))
    }
    const signatureHex = input.signature.slice(SIGNATURE_PREFIX.length)
    const valid = yield* verifyHmacSha256Hex({ secret: input.secret, message: input.body, signatureHex })
    if (!valid) {
      return yield* Effect.fail(new InvalidGithubSignatureError({ reason: "mismatch" }))
    }
  })
