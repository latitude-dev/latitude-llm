import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createSignedExportToken, verifySignedExportToken } from "./signed-url-token.ts"

const SECRET = "test-secret"

async function getFailReason(token: string, secret: string): Promise<{ reason: string } | undefined> {
  const flipped = Effect.flip(verifySignedExportToken(token, secret))
  const exit = await Effect.runPromiseExit(flipped)
  if (exit._tag === "Success") return exit.value as { reason: string }
  return undefined
}

describe("signed-url-token", () => {
  describe("createSignedExportToken / verifySignedExportToken", () => {
    it("round-trips: verify returns the same key", async () => {
      const key = "org/123/projects/p1/dataset-exports/ds1/uuid.csv"
      const token = createSignedExportToken(key, 3600, SECRET)
      const result = await Effect.runPromise(verifySignedExportToken(token, SECRET))
      expect(result).toBe(key)
    })

    it("fails with wrong secret (invalid_signature)", async () => {
      const key = "some/key"
      const token = createSignedExportToken(key, 3600, SECRET)
      const err = await getFailReason(token, "other-secret")
      expect(err?.reason).toBe("invalid_signature")
    })

    it("fails when token is expired", async () => {
      const key = "some/key"
      const token = createSignedExportToken(key, -1, SECRET)
      const err = await getFailReason(token, SECRET)
      expect(err?.reason).toBe("expired")
    })

    it("fails when payload is tampered (invalid_signature)", async () => {
      const key = "original/key"
      const token = createSignedExportToken(key, 3600, SECRET)
      const [, sigB64] = token.split(".")
      const tamperedPayload = Buffer.from(
        JSON.stringify({ key: "tampered/key", exp: Date.now() + 3600_000 }),
        "utf-8",
      ).toString("base64url")
      const tamperedToken = `${tamperedPayload}.${sigB64}`
      const err = await getFailReason(tamperedToken, SECRET)
      expect(err?.reason).toBe("invalid_signature")
    })

    it("fails when format is invalid (no separator)", async () => {
      const err = await getFailReason("nodot", SECRET)
      expect(err?.reason).toBe("invalid_format")
    })

    it("fails when payload is not valid JSON", async () => {
      const badPayload = Buffer.from("not-json", "utf-8").toString("base64url")
      const sig = Buffer.from("fakesig", "utf-8").toString("base64url")
      const err = await getFailReason(`${badPayload}.${sig}`, SECRET)
      expect(["invalid_format", "invalid_payload"]).toContain(err?.reason)
    })
  })
})
