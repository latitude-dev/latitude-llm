import { describe, expect, it } from "vitest"
import { maskApiKeyToken } from "./mask-token.ts"

describe("maskApiKeyToken", () => {
  it("masks a UUID-shaped token keeping the first 4 and last 4 characters", () => {
    const masked = maskApiKeyToken("658e8f6a-1234-5678-9abc-def012341ceb")
    expect(masked).toBe("658e***********1ceb")
  })

  it("returns a fully-masked placeholder for too-short tokens", () => {
    expect(maskApiKeyToken("short")).toBe("***********")
    expect(maskApiKeyToken("12345678")).toBe("***********")
  })

  it("masks an empty string defensively", () => {
    expect(maskApiKeyToken("")).toBe("***********")
  })

  it("works for arbitrary-length tokens", () => {
    const masked = maskApiKeyToken("ABCD-middle-content-XYZW")
    expect(masked.startsWith("ABCD")).toBe(true)
    expect(masked.endsWith("XYZW")).toBe(true)
    expect(masked).not.toContain("middle")
  })
})
