import { Effect } from "effect"
import { InvalidSlackSignatureError } from "./errors.ts"

const SIGNATURE_VERSION = "v0"
const REPLAY_WINDOW_SECONDS = 5 * 60

/**
 * Verifies an inbound Slack webhook request against the app's signing
 * secret per https://api.slack.com/authentication/verifying-requests-from-slack.
 *
 * Not used until Phase 4 (mention webhook). Lands now so the verifier
 * is unit-tested against Slack's published vectors before any inbound
 * traffic depends on it.
 */
export const verifySlackSignature = (input: {
  readonly signingSecret: string
  readonly signature: string
  readonly timestamp: string
  readonly body: string
  readonly nowSeconds?: number
}): Effect.Effect<void, InvalidSlackSignatureError> =>
  Effect.gen(function* () {
    const timestampSeconds = Number(input.timestamp)
    if (!Number.isFinite(timestampSeconds)) {
      return yield* Effect.fail(new InvalidSlackSignatureError({ reason: "format" }))
    }

    const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000)
    if (Math.abs(nowSeconds - timestampSeconds) > REPLAY_WINDOW_SECONDS) {
      return yield* Effect.fail(new InvalidSlackSignatureError({ reason: "stale" }))
    }

    const prefix = `${SIGNATURE_VERSION}=`
    if (!input.signature.startsWith(prefix)) {
      return yield* Effect.fail(new InvalidSlackSignatureError({ reason: "format" }))
    }
    const provided = input.signature.slice(prefix.length)

    const expected = yield* computeHmacHex(input.signingSecret, `${SIGNATURE_VERSION}:${input.timestamp}:${input.body}`)

    if (!constantTimeEqual(expected, provided)) {
      return yield* Effect.fail(new InvalidSlackSignatureError({ reason: "mismatch" }))
    }
  })

const computeHmacHex = (secret: string, message: string): Effect.Effect<string, never> =>
  Effect.promise(async () => {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ])
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message))
    return Array.from(new Uint8Array(signature))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  })

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
