import { createVerify, generateKeyPairSync } from "node:crypto"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { signGithubAppJwt } from "./jwt.ts"

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString()
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString()

const decodeSegment = (segment: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"))

describe("signGithubAppJwt", () => {
  it("produces a verifiable RS256 JWT with the expected claims", async () => {
    const now = 1_700_000_000
    const jwt = await Effect.runPromise(signGithubAppJwt({ appId: "12345", privateKeyPem, nowSeconds: now }))

    const [header, payload, signature] = jwt.split(".")
    expect([header, payload, signature].every((segment) => typeof segment === "string")).toBe(true)
    expect(decodeSegment(header ?? "")).toEqual({ alg: "RS256", typ: "JWT" })

    const claims = decodeSegment(payload ?? "")
    expect(claims.iss).toBe("12345")
    expect(claims.iat).toBe(now - 60)
    expect(claims.exp).toBe(now + 600)

    const verifier = createVerify("RSA-SHA256").update(`${header}.${payload}`)
    const signatureBuffer = Buffer.from((signature ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64")
    expect(verifier.verify(publicKeyPem, signatureBuffer)).toBe(true)
  })

  it("fails with GithubJwtError on an invalid private key", async () => {
    const error = await Effect.runPromise(
      signGithubAppJwt({ appId: "12345", privateKeyPem: "not-a-key" }).pipe(Effect.flip),
    )
    expect(error._tag).toBe("GithubJwtError")
  })
})
