import { describe, expect, it, vi } from "vitest"
import { createCursorAdapter } from "./cursor-adapter.ts"

describe("createCursorAdapter", () => {
  it("posts agent mode payload and maps 409 to success", async () => {
    const calls: { body: string; auth: string }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls.push({
          body: init?.body as string,
          auth: new Headers(init?.headers).get("Authorization") ?? "",
        })
        return new Response(
          JSON.stringify({
            id: "bc_abc123",
            target: { url: "https://cursor.com/agents?id=bc_abc123" },
          }),
          { status: 200 },
        )
      }),
    )

    const adapter = createCursorAdapter()
    const { Effect } = await import("effect")
    const result = await Effect.runPromise(
      adapter.dispatch({
        idempotencyKey: "cursor:incident.opened:src1",
        prompt: "fix it",
        context: {
          trigger: "incident.opened",
          organizationName: "Acme",
          projectName: "App",
          projectSlug: "app",
          deepLinkUrl: "https://example.com",
        },
        config: {
          kind: "cursor",
          repoUrl: "https://github.com/acme/app",
          startingRef: "main",
        },
        credential: { cursorApiKey: "key123" },
      }),
    )

    expect(result.status).toBe("accepted")
    expect(result.externalAgentId).toBe("bc_abc123")
    expect(result.deepLinkUrl).toBe("https://cursor.com/agents?id=bc_abc123")
    const payload = calls[0]!
    expect(JSON.parse(payload.body)).toMatchObject({
      agentId: "cursor:incident.opened:src1",
      prompt: { text: "fix it" },
      source: { repository: "https://github.com/acme/app", ref: "main" },
      target: { autoCreatePr: true },
    })
    expect(payload.auth.startsWith("Basic ")).toBe(true)

    vi.unstubAllGlobals()
  })

  it("maps 401 to auth error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })),
    )
    const adapter = createCursorAdapter()
    const { Effect } = await import("effect")
    await expect(
      Effect.runPromise(
        adapter.dispatch({
          idempotencyKey: "cursor:incident.opened:src1",
          prompt: "fix",
          context: {
            trigger: "incident.opened",
            organizationName: "Acme",
            projectName: "App",
            projectSlug: "app",
            deepLinkUrl: "https://example.com",
          },
          config: {
            kind: "cursor",
            repoUrl: "https://github.com/acme/app",
            startingRef: "main",
          },
          credential: { cursorApiKey: "key123" },
        }),
      ),
    ).rejects.toMatchObject({ reason: "auth" })
    vi.unstubAllGlobals()
  })
})
