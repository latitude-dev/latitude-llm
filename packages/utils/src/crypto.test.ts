import { createHmac } from "node:crypto"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { hmacSha256Hex, verifyHmacSha256Hex } from "./crypto.ts"

const SECRET = "It's a Secret to Everybody"
const MESSAGE = JSON.stringify({ action: "opened", number: 1 })
const expectedHex = createHmac("sha256", SECRET).update(MESSAGE).digest("hex")

describe("hmacSha256Hex", () => {
  it("matches a reference node HMAC-SHA256 hex digest", async () => {
    const digest = await Effect.runPromise(hmacSha256Hex(SECRET, MESSAGE))
    expect(digest).toBe(expectedHex)
  })
})

describe("verifyHmacSha256Hex", () => {
  const verify = (input: { secret: string; message: string; signatureHex: string }) =>
    Effect.runPromise(verifyHmacSha256Hex(input))

  it("accepts a correct signature", async () => {
    expect(await verify({ secret: SECRET, message: MESSAGE, signatureHex: expectedHex })).toBe(true)
  })

  it("rejects a signature from the wrong secret", async () => {
    const wrong = createHmac("sha256", "wrong").update(MESSAGE).digest("hex")
    expect(await verify({ secret: SECRET, message: MESSAGE, signatureHex: wrong })).toBe(false)
  })

  it("rejects a tampered message", async () => {
    expect(await verify({ secret: SECRET, message: `${MESSAGE} `, signatureHex: expectedHex })).toBe(false)
  })

  it("rejects a length-mismatched signature without throwing", async () => {
    expect(await verify({ secret: SECRET, message: MESSAGE, signatureHex: "deadbeef" })).toBe(false)
  })
})
