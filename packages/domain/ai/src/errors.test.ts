import { describe, expect, it } from "vitest"
import { isHttpError } from "@repo/utils"
import { AIError, AICredentialError } from "./index.ts"

describe("AIError", () => {
  it("implements HttpError with 502 and exposes message as httpMessage", () => {
    const err = new AIError({ message: "Embedding failed" })
    expect(isHttpError(err)).toBe(true)
    expect(err.httpStatus).toBe(502)
    expect(err.httpMessage).toBe("Embedding failed")
  })
})

describe("AICredentialError", () => {
  it("defaults to 503 and uses message as httpMessage", () => {
    const err = new AICredentialError({
      provider: "openai",
      message: "Missing key",
    })
    expect(isHttpError(err)).toBe(true)
    expect(err.httpStatus).toBe(503)
    expect(err.httpMessage).toBe("Missing key")
  })

  it("honors optional statusCode", () => {
    const err = new AICredentialError({
      provider: "custom",
      message: "Unsupported",
      statusCode: 400,
    })
    expect(err.httpStatus).toBe(400)
    expect(err.httpMessage).toBe("Unsupported")
  })
})
