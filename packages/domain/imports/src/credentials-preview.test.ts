import { describe, expect, it } from "vitest"
import { previewCredentials } from "./credentials-preview.ts"

describe("previewCredentials", () => {
  it("shows the Langfuse region with a masked public key and never the secret", () => {
    const preview = previewCredentials({
      kind: "langfuse",
      region: "eu",
      publicKey: "pk-lf-abcdef123456",
      secretKey: "sk-lf-supersecretvalue",
    })

    expect(preview).toBe("eu · pk-l…3456")
    expect(preview).not.toContain("supersecret")
    expect(preview).not.toContain("sk-lf-supersecretvalue")
  })

  it.each([
    ["langsmith" as const, "gcp-eu" as const],
    ["braintrust" as const, "eu" as const],
  ])("shows the %s region with a masked api key", (kind, region) => {
    const preview = previewCredentials({ kind, region, apiKey: "lsv2_pt_abcdefghijklmnop" } as never)

    expect(preview).toBe(`${region} · lsv2…mnop`)
    expect(preview).not.toContain("abcdefghijkl")
  })

  it("fully elides a secret too short to mask safely", () => {
    expect(previewCredentials({ kind: "braintrust", region: "us", apiKey: "short" })).toBe("us · …")
  })

  it("leaks no more than the first and last four characters of any secret", () => {
    const apiKey = "0123456789abcdef"
    const preview = previewCredentials({ kind: "langsmith", region: "gcp-us", apiKey })

    expect(preview).toBe("gcp-us · 0123…cdef")
    expect(preview).not.toContain(apiKey.slice(4, -4))
  })
})
