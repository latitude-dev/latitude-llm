import { Cause, Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import type { InvalidElevenlabsSignatureError } from "./errors.ts"
import { verifyElevenlabsSignature } from "./signature.ts"

const signingSecret = "test-webhook-secret"
const body = JSON.stringify({ type: "post_call_transcription_otel", data: { conversation_id: "conv_1" } })
const timestamp = "1700000000"

const sign = async (secret: string, ts: string, rawBody: string): Promise<string> => {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ])
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${ts}.${rawBody}`))
  const digest = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `t=${ts},v0=${digest}`
}

const failure = async (
  effect: Effect.Effect<void, InvalidElevenlabsSignatureError>,
): Promise<InvalidElevenlabsSignatureError> => {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) throw new Error("Expected failure")
  const failReason = exit.cause.reasons.find(Cause.isFailReason)
  if (!failReason) throw new Error("Expected typed failure")
  return failReason.error
}

describe("verifyElevenlabsSignature", () => {
  it("accepts a valid signature", async () => {
    const signature = await sign(signingSecret, timestamp, body)
    await Effect.runPromise(
      verifyElevenlabsSignature({
        signingSecret,
        signature,
        body,
        nowSeconds: Number(timestamp),
      }),
    )
  })

  it("rejects a tampered body", async () => {
    const signature = await sign(signingSecret, timestamp, body)
    const err = await failure(
      verifyElevenlabsSignature({
        signingSecret,
        signature,
        body: `${body} `,
        nowSeconds: Number(timestamp),
      }),
    )
    expect(err.reason).toBe("mismatch")
  })

  it("rejects stale timestamps", async () => {
    const signature = await sign(signingSecret, timestamp, body)
    const err = await failure(
      verifyElevenlabsSignature({
        signingSecret,
        signature,
        body,
        nowSeconds: Number(timestamp) + 6 * 60,
      }),
    )
    expect(err.reason).toBe("stale")
  })
})
