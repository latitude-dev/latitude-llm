import { describe, expect, it, vi } from "vitest"
import { createCursorAdapter } from "./cursor-adapter.ts"

describe("createCursorAdapter", () => {
  it("posts v1 agent payload with a deterministic Cursor agent id", async () => {
    const calls: { url: string; body: string; auth: string }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls.push({
          url: _url,
          body: init?.body as string,
          auth: new Headers(init?.headers).get("Authorization") ?? "",
        })
        return new Response(
          JSON.stringify({
            agent: { id: "bc-abc123", url: "https://cursor.com/agents/bc-abc123" },
            run: { id: "run-abc123" },
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
    expect(result.externalAgentId).toBe("bc-abc123")
    expect(result.externalRunId).toBe("run-abc123")
    expect(result.deepLinkUrl).toBe("https://cursor.com/agents/bc-abc123")
    const payload = calls[0] ?? {}
    expect(payload.url).toBe("https://api.cursor.com/v1/agents")
    const body = JSON.parse(payload.body)
    expect(body.agentId).toMatch(/^bc-[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(body).toEqual({
      agentId: body.agentId,
      prompt: { text: "fix it" },
      repos: [{ url: "https://github.com/acme/app", startingRef: "main" }],
      autoCreatePR: true,
    })
    expect(payload.auth.startsWith("Basic ")).toBe(true)

    vi.unstubAllGlobals()
  })

  it("maps Cursor agent id conflicts to the deterministic agent", async () => {
    let sentAgentId = ""
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentAgentId = JSON.parse(init?.body as string).agentId
        return new Response(JSON.stringify({ error: "agent_id_conflict" }), { status: 409 })
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
    expect(result.externalAgentId).toBe(sentAgentId)
    expect(result.deepLinkUrl).toBe(`https://cursor.com/agents/${sentAgentId}`)

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
