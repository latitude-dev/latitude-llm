import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createWebhookAdapter } from "./webhook-adapter.ts"

const webhookUrl = "https://hooks.example.com/run"

const dispatchWebhook = async () => {
  const adapter = createWebhookAdapter(async () => ["8.8.8.8"])
  const { Effect } = await import("effect")

  return Effect.runPromise(
    adapter.dispatch({
      idempotencyKey: "webhook:incident.opened:src1",
      prompt: "fix it",
      context: {
        trigger: "incident.opened",
        organizationName: "Acme",
        projectName: "App",
        projectSlug: "app",
        deepLinkUrl: "https://example.com",
      },
      config: { kind: "webhook", webhookUrl },
      credential: { webhookSecret: "test-secret" },
    }),
  )
}

describe("createWebhookAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

    await dispatchWebhook()

    expect(calls).toHaveLength(1)
    const call = calls[0]
    if (!call) throw new Error("expected fetch call")
    const expectedSig = createHmac("sha256", secret).update(call.body).digest("hex")
    expect(call.headers.get("X-Latitude-Signature")).toBe(`sha256=${expectedSig}`)
    expect(call.headers.get("X-Latitude-Delivery")).toBe("webhook:incident.opened:src1")
  })

  it("returns external run metadata from a successful JSON acknowledgement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              externalAgentId: "agent-scope",
              externalRunId: "run-123",
              deepLinkUrl: "https://agents.example.com/runs/run-123",
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
      ),
    )

    await expect(dispatchWebhook()).resolves.toEqual({
      status: "accepted",
      externalAgentId: "agent-scope",
      externalRunId: "run-123",
      deepLinkUrl: "https://agents.example.com/runs/run-123",
    })
  })

  it.each([
    "javascript:alert(1)",
    "not a url",
    "   ",
  ])("keeps valid acknowledgement fields when the deep link %j is invalid", async (deepLinkUrl) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              externalAgentId: "agent-scope",
              externalRunId: "   ",
              deepLinkUrl,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    )

    await expect(dispatchWebhook()).resolves.toEqual({
      status: "accepted",
      externalAgentId: "agent-scope",
      deepLinkUrl: webhookUrl,
    })
  })

  it.each([
    { name: "empty", response: () => new Response(null, { status: 204 }) },
    { name: "plain-text", response: () => new Response("accepted", { status: 202 }) },
    {
      name: "malformed JSON",
      response: () => new Response("{", { status: 200, headers: { "Content-Type": "application/json" } }),
    },
  ])("accepts a $name success response without metadata", async ({ response }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    )

    await expect(dispatchWebhook()).resolves.toEqual({ status: "accepted", deepLinkUrl: webhookUrl })
  })

  it("discards metadata when the acknowledgement body exceeds the read limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ externalRunId: "run-123" }) + "x".repeat(64 * 1024), {
            status: 202,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    )

    await expect(dispatchWebhook()).resolves.toEqual({ status: "accepted", deepLinkUrl: webhookUrl })
  })

  it("discards metadata and cancels a response that never finishes", async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ externalRunId: "run-123" })))
      },
      cancel() {
        cancelled = true
      },
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 202 })),
    )

    await expect(dispatchWebhook()).resolves.toEqual({ status: "accepted", deepLinkUrl: webhookUrl })
    await vi.waitFor(() => expect(cancelled).toBe(true))
  })
})
