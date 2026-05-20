import { Cause, Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import type { InvalidSlackSignatureError } from "./errors.ts"
import { verifySlackSignature } from "./signature.ts"

/**
 * Vector published by Slack at
 * https://api.slack.com/authentication/verifying-requests-from-slack.
 * Computed with their canonical sample signing secret + request body;
 * we anchor the implementation against it.
 */
const SLACK_VECTOR = {
  signingSecret: "8f742231b10e8888abcd99yyyzzz85a5",
  timestamp: "1531420618",
  body: "token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c",
  signature: "v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
  nowSeconds: 1531420618,
}

const failure = async (
  effect: Effect.Effect<void, InvalidSlackSignatureError>,
): Promise<InvalidSlackSignatureError> => {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) throw new Error("Expected failure")
  const failReason = exit.cause.reasons.find(Cause.isFailReason)
  if (!failReason) throw new Error("Expected typed failure")
  return failReason.error
}

describe("verifySlackSignature", () => {
  it("accepts the published Slack vector", async () => {
    await Effect.runPromise(verifySlackSignature(SLACK_VECTOR))
  })

  it("rejects a tampered body with a `mismatch` reason", async () => {
    const err = await failure(
      verifySlackSignature({
        ...SLACK_VECTOR,
        body: `${SLACK_VECTOR.body}&extra=evil`,
      }),
    )
    expect(err.reason).toBe("mismatch")
  })

  it("rejects timestamps older than the 5-minute replay window", async () => {
    const err = await failure(
      verifySlackSignature({
        ...SLACK_VECTOR,
        nowSeconds: Number(SLACK_VECTOR.timestamp) + 6 * 60,
      }),
    )
    expect(err.reason).toBe("stale")
  })

  it("rejects malformed signature headers (no `v0=` prefix)", async () => {
    const err = await failure(
      verifySlackSignature({
        ...SLACK_VECTOR,
        signature: "deadbeef",
      }),
    )
    expect(err.reason).toBe("format")
  })

  it("rejects non-numeric timestamps with a `format` reason", async () => {
    const err = await failure(
      verifySlackSignature({
        ...SLACK_VECTOR,
        timestamp: "not-a-timestamp",
      }),
    )
    expect(err.reason).toBe("format")
  })
})
