import { createHmac } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import type { PinnedHttpsResponse, ResolvedPublicWebhookTarget } from "../host-guard.ts"
import { createWebhookAdapter } from "./webhook-adapter.ts"

const webhookUrl = "https://hooks.example.com/run"
const pinnedTarget: ResolvedPublicWebhookTarget = {
  url: new URL(webhookUrl),
  address: "8.8.8.8",
}

const makePinnedResponse = (body = "{}", status = 200): PinnedHttpsResponse => ({
  status,
  headers: new Headers(),
  body: new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  }),
  text: async () => body,
})

const dispatchWebhook = async (
  postHttps: (
    target: ResolvedPublicWebhookTarget,
    init: { readonly headers: Record<string, string>; readonly body: string },
  ) => Promise<PinnedHttpsResponse> = async () => makePinnedResponse(),
) => {
  const adapter = createWebhookAdapter(async () => ["8.8.8.8"], postHttps)
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
  it("signs the payload with HMAC-SHA256", async () => {
    const secret = "test-secret"
    const calls: { headers: Record<string, string>; body: string; target: ResolvedPublicWebhookTarget }[] = []

    await dispatchWebhook(async (target, init) => {
      calls.push({ target, headers: init.headers, body: init.body })
      return makePinnedResponse()
    })

    expect(calls).toHaveLength(1)
    const call = calls[0]
    if (!call) throw new Error("expected pinned POST")
    expect(call.target).toEqual(pinnedTarget)
    const expectedSig = createHmac("sha256", secret).update(call.body).digest("hex")
    expect(call.headers["X-Latitude-Signature"]).toBe(`sha256=${expectedSig}`)
    expect(call.headers["X-Latitude-Delivery"]).toBe("webhook:incident.opened:src1")
  })

  it("returns external run metadata from a successful JSON acknowledgement", async () => {
    await expect(
      dispatchWebhook(async () =>
        makePinnedResponse(
          JSON.stringify({
            externalAgentId: "  agent-scope  ",
            externalRunId: "  run-123  ",
            deepLinkUrl: "https://agents.example.com/runs/run-123",
          }),
          202,
        ),
      ),
    ).resolves.toEqual({
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
    await expect(
      dispatchWebhook(async () =>
        makePinnedResponse(
          JSON.stringify({
            externalAgentId: "agent-scope",
            externalRunId: "   ",
            deepLinkUrl,
          }),
        ),
      ),
    ).resolves.toEqual({
      status: "accepted",
      externalAgentId: "agent-scope",
      deepLinkUrl: webhookUrl,
    })
  })

  it.each([
    { name: "empty", response: () => ({ status: 204, headers: new Headers(), body: null, text: async () => "" }) },
    { name: "plain-text", response: () => makePinnedResponse("accepted", 202) },
    { name: "malformed JSON", response: () => makePinnedResponse("{", 200) },
  ])("accepts a $name success response without metadata", async ({ response }) => {
    await expect(dispatchWebhook(async () => response())).resolves.toEqual({
      status: "accepted",
      deepLinkUrl: webhookUrl,
    })
  })

  it("discards metadata when the acknowledgement body exceeds the read limit", async () => {
    await expect(
      dispatchWebhook(async () =>
        makePinnedResponse(JSON.stringify({ externalRunId: "run-123" }) + "x".repeat(64 * 1024)),
      ),
    ).resolves.toEqual({ status: "accepted", deepLinkUrl: webhookUrl })
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

    await expect(
      dispatchWebhook(async () => ({
        status: 202,
        headers: new Headers(),
        body,
        text: async () => "",
      })),
    ).resolves.toEqual({ status: "accepted", deepLinkUrl: webhookUrl })
    await vi.waitFor(() => expect(cancelled).toBe(true))
  })
})
