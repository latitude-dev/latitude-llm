import { magicLinkTemplate } from "@domain/email"
import { describe, expect, it } from "vitest"

describe("magic link email copy", () => {
  it("uses neutral account-existence copy", async () => {
    const rendered = await magicLinkTemplate({
      userName: "there",
      magicLinkUrl: "https://console.latitude.so/api/auth/magic-link/verify?token=test",
    })

    expect(rendered.subject).toBe("Continue to Latitude")
    expect(rendered.text).toContain("use this link to continue to Latitude")
    expect(rendered.html).toContain("Continue to Latitude")
    expect(rendered.html).not.toContain("Welcome back")
    expect(rendered.html).not.toContain("signing up")
    expect(rendered.html).not.toContain("Sign In to Latitude")
  })
})
