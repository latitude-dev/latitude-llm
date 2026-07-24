import { createHmac } from "node:crypto"
import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { InvalidGithubSignatureError } from "./errors.ts"
import { verifyGithubSignature } from "./signature.ts"

const SECRET = "It's a Secret to Everybody"
const BODY = JSON.stringify({ action: "opened", number: 1 })

const validSignature = (secret: string, body: string): string =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`

const runExit = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromiseExit(effect)

describe("verifyGithubSignature", () => {
  it("accepts a correct signature over the raw body", async () => {
    const exit = await runExit(
      verifyGithubSignature({ secret: SECRET, signature: validSignature(SECRET, BODY), body: BODY }),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("rejects a signature computed with the wrong secret", async () => {
    const exit = await runExit(
      verifyGithubSignature({ secret: SECRET, signature: validSignature("wrong-secret", BODY), body: BODY }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("rejects when the body was tampered with", async () => {
    const exit = await runExit(
      verifyGithubSignature({ secret: SECRET, signature: validSignature(SECRET, BODY), body: `${BODY} ` }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("fails with reason 'missing' when the header is absent", async () => {
    const error = await Effect.runPromise(
      verifyGithubSignature({ secret: SECRET, signature: null, body: BODY }).pipe(Effect.flip),
    )
    expect(error).toBeInstanceOf(InvalidGithubSignatureError)
    expect(error.reason).toBe("missing")
  })

  it("fails with reason 'format' when the prefix is wrong", async () => {
    const error = await Effect.runPromise(
      verifyGithubSignature({
        secret: SECRET,
        signature: createHmac("sha256", SECRET).update(BODY).digest("hex"),
        body: BODY,
      }).pipe(Effect.flip),
    )
    expect(error.reason).toBe("format")
  })
})
