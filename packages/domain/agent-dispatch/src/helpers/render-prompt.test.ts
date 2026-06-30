import { describe, expect, it } from "vitest"
import { buildDispatchIdempotencyKey } from "./idempotency-key.ts"
import { renderDispatchPrompt } from "./render-prompt.ts"

describe("buildDispatchIdempotencyKey", () => {
  it("keys by vendor, trigger, and source id", () => {
    expect(
      buildDispatchIdempotencyKey({
        vendor: "webhook",
        trigger: "incident.opened",
        sourceId: "clinc456",
      }),
    ).toBe("webhook:incident.opened:clinc456")
  })
})

describe("renderDispatchPrompt", () => {
  it("substitutes placeholders from context", () => {
    const prompt = renderDispatchPrompt({
      context: {
        trigger: "incident.opened",
        organizationName: "Acme",
        projectName: "My App",
        projectSlug: "my-app",
        signal: {
          id: "sig1",
          slug: "timeout-errors",
          name: "Timeout errors",
          source: "flagger",
          priority: "high",
        },
        deepLinkUrl: "https://console.latitude.so/projects/my-app/signals/timeout-errors",
      },
    })
    expect(prompt).toContain("My App")
    expect(prompt).toContain("Timeout errors")
    expect(prompt).toContain("sig1")
    expect(prompt).toContain("console.latitude.so")
  })
})
