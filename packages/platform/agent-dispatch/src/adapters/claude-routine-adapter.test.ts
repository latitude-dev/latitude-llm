import { describe, expect, it, vi } from "vitest"
import { createClaudeRoutineAdapter } from "./claude-routine-adapter.ts"

describe("createClaudeRoutineAdapter", () => {
  it("fires routine with beta headers and freeform text", async () => {
    const calls: { url: string; headers: Headers; body: string }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          headers: new Headers(init?.headers),
          body: init?.body as string,
        })
        return new Response(JSON.stringify({ session_id: "sess1", url: "https://claude.ai/code/sess1" }), {
          status: 200,
        })
      }),
    )

    const adapter = createClaudeRoutineAdapter()
    const { Effect } = await import("effect")
    const result = await Effect.runPromise(
      adapter.dispatch({
        idempotencyKey: "claude_code:incident.opened:src1",
        prompt: "investigate signal",
        context: {
          trigger: "incident.opened",
          organizationName: "Acme",
          projectName: "App",
          projectSlug: "app",
          deepLinkUrl: "https://example.com",
        },
        config: { kind: "claude_code", routineTriggerId: "trig_abc" },
        credential: { claudeRoutineToken: "oat-token" },
      }),
    )

    expect(result.status).toBe("accepted")
    expect(result.externalAgentId).toBe("sess1")
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/claude_code/routines/trig_abc/fire")
    expect(calls[0]!.headers.get("anthropic-beta")).toBe("experimental-cc-routine-2026-04-01")
    expect(JSON.parse(calls[0]!.body)).toEqual({ text: "investigate signal" })

    vi.unstubAllGlobals()
  })
})
