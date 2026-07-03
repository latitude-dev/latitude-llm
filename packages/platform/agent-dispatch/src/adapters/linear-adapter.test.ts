import { describe, expect, it, vi } from "vitest"
import { createLinearAdapter } from "./linear-adapter.ts"

describe("createLinearAdapter", () => {
  it("creates an issue from dispatch context", async () => {
    const calls: { body: string }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls.push({ body: init?.body as string })
        return new Response(
          JSON.stringify({
            data: {
              issueCreate: {
                success: true,
                issue: {
                  id: "iss1",
                  url: "https://linear.app/acme/issue/AC-1",
                },
              },
            },
          }),
          { status: 200 },
        )
      }),
    )

    const adapter = createLinearAdapter()
    const { Effect } = await import("effect")
    const result = await Effect.runPromise(
      adapter.dispatch({
        idempotencyKey: "linear:incident.opened:src1",
        prompt: "fix the timeout",
        context: {
          trigger: "incident.opened",
          organizationName: "Acme",
          projectName: "App",
          projectSlug: "app",
          deepLinkUrl: "https://console.latitude.so/projects/app/signals/timeout",
          signal: {
            id: "sig1",
            slug: "timeout",
            name: "Timeout errors",
            source: "flagger",
            priority: "high",
          },
        },
        config: { kind: "linear", teamId: "team1" },
        credential: { linearApiKey: "lin_api_123" },
      }),
    )

    expect(result.status).toBe("accepted")
    expect(result.deepLinkUrl).toBe("https://linear.app/acme/issue/AC-1")
    const payload = JSON.parse(calls[0]?.body) as {
      query: string
      variables: {
        input: { title: string; description: string; teamId: string }
      }
    }
    expect(payload.query).toContain("issueCreate")
    expect(payload.variables.input.title).toContain("Timeout errors")
    expect(payload.variables.input.teamId).toBe("team1")

    vi.unstubAllGlobals()
  })
})
