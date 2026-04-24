import { describe, expect, it, vi } from "vitest"
import registerLatitudePlugin, { type OpenClawPluginApiLike } from "./plugin.ts"
import type { RunRecord } from "./types.ts"

function makeApi(): {
  api: OpenClawPluginApiLike
  fire: (hookName: string, event: unknown, ctx: unknown) => Promise<void>
} {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>()
  const api: OpenClawPluginApiLike = {
    on: (hookName, handler) => {
      const list = handlers.get(hookName) ?? []
      list.push(handler as (event: unknown, ctx: unknown) => unknown)
      handlers.set(hookName, list)
    },
  }
  async function fire(hookName: string, event: unknown, ctx: unknown): Promise<void> {
    for (const h of handlers.get(hookName) ?? []) await h(event, ctx)
  }
  return { api, fire }
}

describe("registerLatitudePlugin", () => {
  it("does nothing when config is disabled", () => {
    const { api } = makeApi()
    const spy = vi.spyOn(api, "on")
    registerLatitudePlugin(api, {
      config: { apiKey: "", project: "", baseUrl: "", enabled: false, debug: false },
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it("builds a run from the full hook sequence and emits it", async () => {
    const { api, fire } = makeApi()
    const emitted: RunRecord[] = []
    registerLatitudePlugin(api, {
      config: {
        apiKey: "x",
        project: "p",
        baseUrl: "http://localhost:0", // unreachable — fetch will fail silently via logger.warn
        enabled: true,
        debug: false,
      },
      onEmit: (r) => emitted.push(r),
    })

    const ctx = { runId: "r-1", sessionId: "s-1", sessionKey: "sk-1", agentId: "router" }

    await fire(
      "llm_input",
      {
        runId: "r-1",
        sessionId: "s-1",
        provider: "openai",
        model: "gpt-5",
        systemPrompt: "sys",
        prompt: "hi",
        historyMessages: [],
        imagesCount: 0,
      },
      ctx,
    )
    await fire("before_tool_call", { toolName: "grep", params: { q: "x" }, runId: "r-1", toolCallId: "tc-1" }, ctx)
    await fire(
      "after_tool_call",
      {
        toolName: "grep",
        params: { q: "x" },
        runId: "r-1",
        toolCallId: "tc-1",
        result: "1 match",
      },
      ctx,
    )
    await fire(
      "llm_output",
      {
        runId: "r-1",
        sessionId: "s-1",
        provider: "openai",
        model: "gpt-5",
        assistantTexts: ["done"],
        lastAssistant: { role: "assistant", content: "done" },
        usage: { input: 10, output: 2, total: 12 },
      },
      ctx,
    )
    await fire("agent_end", { messages: [], success: true, durationMs: 200 }, ctx)

    expect(emitted).toHaveLength(1)
    const run = emitted[0]
    if (!run) throw new Error("expected run")
    expect(run.llmCalls).toHaveLength(1)
    expect(run.llmCalls[0]?.toolCalls).toHaveLength(1)
    expect(run.llmCalls[0]?.toolCalls[0]?.result).toBe("1 match")
    expect(run.agentId).toBe("router")
  })
})
