import { createHmac } from "node:crypto"
import { DispatchAdapterError } from "@domain/agent-dispatch"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { createWebhookAdapter } from "./webhook-adapter.ts"

const baseInput = {
  idempotencyKey: "webhook:incident.opened:src1",
  prompt: "fix it",
  context: {
    trigger: "incident.opened" as const,
    organizationName: "Acme",
    projectName: "App",
    projectSlug: "app",
    deepLinkUrl: "https://example.com",
  },
  credential: { webhookSecret: "test-secret" },
}

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

    const adapter = createWebhookAdapter(async () => ["8.8.8.8"])
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
    const call = calls[0]
    if (!call) throw new Error("expected fetch call")
    const expectedSig = createHmac("sha256", secret).update(call.body).digest("hex")
    expect(call.headers.get("X-Latitude-Signature")).toBe(`sha256=${expectedSig}`)
    expect(call.headers.get("X-Latitude-Delivery")).toBe("webhook:incident.opened:src1")

    vi.unstubAllGlobals()
  })

  describe("host-guard rejections", () => {
    it.each([
      ["malformed URL", "not-a-url", async () => ["8.8.8.8"]],
      ["non-https URL", "http://hooks.example.com/run", async () => ["8.8.8.8"]],
      ["unresolvable host", "https://hooks.example.com/run", async () => []],
      ["host resolving to a private IP", "https://hooks.example.com/run", async () => ["127.0.0.1"]],
    ] as const)("classifies %s as a config error, not a retryable transport error", async (_case, webhookUrl, lookupHost) => {
      const adapter = createWebhookAdapter(lookupHost)

      const error = await Effect.runPromise(
        adapter
          .dispatch({
            ...baseInput,
            config: { kind: "webhook", webhookUrl },
          })
          .pipe(Effect.flip),
      )

      expect(error).toBeInstanceOf(DispatchAdapterError)
      expect((error as DispatchAdapterError).reason).toBe("config")
    })
  })
})
