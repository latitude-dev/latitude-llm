import { describe, expect, it, vi } from "vitest"
import registerLatitudePlugin, { type OpenClawPluginApiLike } from "./plugin.ts"
import type { BuildResult } from "./span-builder.ts"

function makeApi(): {
  api: OpenClawPluginApiLike
  fire: (hookName: string, event: unknown, ctx: unknown) => Promise<unknown>
} {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>()
  const api: OpenClawPluginApiLike = {
    on: (hookName, handler) => {
      const list = handlers.get(hookName) ?? []
      list.push(handler as (event: unknown, ctx: unknown) => unknown)
      handlers.set(hookName, list)
    },
  }
  async function fire(hookName: string, event: unknown, ctx: unknown): Promise<unknown> {
    let lastReturn: unknown
    for (const h of handlers.get(hookName) ?? []) {
      lastReturn = await h(event, ctx)
    }
    return lastReturn
  }
  return { api, fire }
}

describe("registerLatitudePlugin", () => {
  it("does nothing when config is disabled", () => {
    const { api } = makeApi()
    const spy = vi.spyOn(api, "on")
    registerLatitudePlugin(api, {
      config: {
        apiKey: "",
        project: "",
        baseUrl: "",
        enabled: false,
        debug: false,
        allowConversationAccess: false,
      },
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it("reads creds from api.pluginConfig (OpenClaw passes-config path)", () => {
    const { api } = makeApi()
    api.pluginConfig = { apiKey: "k", project: "p", allowConversationAccess: true }
    const spy = vi.spyOn(api, "on")
    registerLatitudePlugin(api)
    expect(spy).toHaveBeenCalled()
  })

  it("subscribes to all the granular paired hooks plus data feeds", () => {
    const { api } = makeApi()
    const spy = vi.spyOn(api, "on")
    registerLatitudePlugin(api, {
      config: {
        apiKey: "x",
        project: "p",
        baseUrl: "http://localhost:0",
        enabled: true,
        debug: false,
        allowConversationAccess: true,
      },
    })
    const subscribed = new Set(spy.mock.calls.map((c) => c[0]))
    for (const name of [
      "before_agent_start",
      "model_call_started",
      "model_call_ended",
      "before_tool_call",
      "after_tool_call",
      "before_compaction",
      "after_compaction",
      "subagent_spawned",
      "subagent_ended",
      "llm_input",
      "llm_output",
      "agent_end",
    ]) {
      expect(subscribed).toContain(name)
    }
  })

  it("before_tool_call handler returns nothing (must not block tool dispatch)", async () => {
    const { api, fire } = makeApi()
    registerLatitudePlugin(api, {
      config: {
        apiKey: "x",
        project: "p",
        baseUrl: "http://localhost:0",
        enabled: true,
        debug: false,
        allowConversationAccess: true,
      },
    })
    // Open a run so the before_tool_call handler has somewhere to attach the span.
    const ctx = { runId: "r-1", sessionId: "s-1", agentId: "router" }
    await fire("before_agent_start", { prompt: "hi" }, ctx)
    const ret = await fire(
      "before_tool_call",
      { toolName: "grep", params: { q: "x" }, runId: "r-1", toolCallId: "tc-1" },
      ctx,
    )
    // Returning anything truthy (especially `{block: true}`) would block the
    // tool. We must return undefined.
    expect(ret).toBeUndefined()
  })

  it("builds the full span tree and emits it on agent_end", async () => {
    const { api, fire } = makeApi()
    const emitted: BuildResult[] = []
    registerLatitudePlugin(api, {
      config: {
        apiKey: "x",
        project: "p",
        baseUrl: "http://localhost:0", // unreachable — fetch fails via logger.warn
        enabled: true,
        debug: false,
        allowConversationAccess: true,
      },
      onEmit: (r) => emitted.push(r),
    })

    const ctx = { runId: "r-1", sessionId: "s-1", sessionKey: "sk-1", agentId: "router" }

    await fire("before_agent_start", { prompt: "do thing" }, ctx)
    await fire(
      "llm_input",
      {
        runId: "r-1",
        sessionId: "s-1",
        provider: "openai",
        model: "gpt-5",
        systemPrompt: "sys",
        prompt: "do thing",
        historyMessages: [],
        imagesCount: 0,
      },
      ctx,
    )
    await fire("model_call_started", { runId: "r-1", callId: "A", provider: "openai", model: "gpt-5" }, ctx)
    await fire(
      "model_call_ended",
      { runId: "r-1", callId: "A", provider: "openai", model: "gpt-5", outcome: "completed", durationMs: 100 },
      ctx,
    )
    await fire("before_tool_call", { toolName: "grep", params: { q: "x" }, runId: "r-1", toolCallId: "tc-1" }, ctx)
    await fire(
      "after_tool_call",
      { toolName: "grep", params: { q: "x" }, runId: "r-1", toolCallId: "tc-1", result: "1 match" },
      ctx,
    )
    await fire("model_call_started", { runId: "r-1", callId: "B", provider: "openai", model: "gpt-5" }, ctx)
    await fire(
      "model_call_ended",
      { runId: "r-1", callId: "B", provider: "openai", model: "gpt-5", outcome: "completed", durationMs: 80 },
      ctx,
    )
    await fire(
      "llm_output",
      {
        runId: "r-1",
        sessionId: "s-1",
        provider: "openai",
        model: "gpt-5",
        resolvedRef: "openai/gpt-5",
        assistantTexts: ["done"],
        lastAssistant: { role: "assistant", content: "done" },
        usage: { input: 10, output: 2, total: 12 },
      },
      ctx,
    )
    await fire("agent_end", { messages: [], success: true, durationMs: 200 }, ctx)

    expect(emitted).toHaveLength(1)
    const result = emitted[0]
    if (!result) throw new Error("expected result")
    const names = result.spans.map((s) => s.name).sort()
    expect(names).toEqual(["agent", "model_call", "model_call", "tool_call:grep"])
    // Two model_call spans, not one big llm_request.
  })
})
