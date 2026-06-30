import { createHmac } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { createWebhookAdapter } from "./webhook-adapter.ts"

describe("createWebhookAdapter", () => {
  it("signs the payload with HMAC-SHA256", async () => {
    const secret = "test-secret"
    const calls: { headers: Headers; body: string }[] = []

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls.push({
          headers: new Headers(init?.headers),
          body: init?.body as string,
        })
        return new Response("{}", { status: 200 })
      }),
    )

    const adapter = createWebhookAdapter()
    const context = {
      trigger: "incident.opened" as const,
      organizationName: "Acme",
      projectName: "App",
      projectSlug: "app",
      deepLinkUrl: "https://example.com",
    }

    await import("effect").then(({ Effect }) =>
      Effect.runPromise(
        adapter.dispatch({
          idempotencyKey: "webhook:incident.opened:src1",
          prompt: "fix it",
          context,
          config: { kind: "webhook", webhookUrl: "https://hooks.example.com/run" },
          credential: { webhookSecret: secret },
        }),
      ),
    )

    expect(calls).toHaveLength(1)
    const expectedSig = createHmac("sha256", secret).update(calls[0]!.body).digest("hex")
    expect(calls[0]!.headers.get("X-Latitude-Signature")).toBe(`sha256=${expectedSig}`)
    expect(calls[0]!.headers.get("X-Latitude-Delivery")).toBe("webhook:incident.opened:src1")

    vi.unstubAllGlobals()
  })
})
