import { describe, expect, it } from "vitest"
import { previewCredentials } from "./credentials-preview.ts"

describe("previewCredentials", () => {
  it("reveals the prefix and last 4 of a posthog key, hiding the middle", () => {
    expect(previewCredentials({ kind: "posthog", apiKey: "phc_abcdefghijklmnopqrstuvwxyz1234" })).toBe("phc_abcd…1234")
  })

  it("returns a bare ellipsis for a secret too short to split", () => {
    expect(previewCredentials({ kind: "posthog", apiKey: "phc_short" })).toBe("…")
  })
})
