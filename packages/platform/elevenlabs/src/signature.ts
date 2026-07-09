import { Effect } from "effect"
import { InvalidElevenlabsSignatureError } from "./errors.ts"

const REPLAY_WINDOW_SECONDS = 5 * 60

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

const parseSignatureHeader = (signature: string): { readonly timestamp: string; readonly digest: string } | null => {
  let timestamp: string | undefined
  let digest: string | undefined

  for (const part of signature.split(",")) {
    const trimmed = part.trim()
    if (trimmed.startsWith("t=")) {
      timestamp = trimmed.slice(2)
    } else if (trimmed.startsWith("v0=")) {
      digest = trimmed.slice(3)
    }
  }

  if (!timestamp || !digest) return null
  return { timestamp, digest }
}

export const verifyElevenlabsSignature = (input: {
  readonly signingSecret: string
  readonly signature: string | null | undefined
  readonly body: string
  readonly nowSeconds?: number
}): Effect.Effect<void, InvalidElevenlabsSignatureError> =>
  Effect.gen(function* () {
    if (!input.signature) {
      return yield* Effect.fail(new InvalidElevenlabsSignatureError({ reason: "format" }))
    }

    const parsed = parseSignatureHeader(input.signature)
    if (!parsed) {
      return yield* Effect.fail(new InvalidElevenlabsSignatureError({ reason: "format" }))
    }

    const timestampSeconds = Number(parsed.timestamp)
    if (!Number.isFinite(timestampSeconds)) {
      return yield* Effect.fail(new InvalidElevenlabsSignatureError({ reason: "format" }))
    }

    const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000)
    if (Math.abs(nowSeconds - timestampSeconds) > REPLAY_WINDOW_SECONDS) {
      return yield* Effect.fail(new InvalidElevenlabsSignatureError({ reason: "stale" }))
    }

    const expected = yield* computeHmacHex(input.signingSecret, `${parsed.timestamp}.${input.body}`)
    if (!constantTimeEqual(expected, parsed.digest)) {
      return yield* Effect.fail(new InvalidElevenlabsSignatureError({ reason: "mismatch" }))
    }
  })
