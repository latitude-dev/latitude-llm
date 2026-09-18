import { describe, expect, it, vi } from "vitest"
import type { Config } from "./config.ts"
import registerLatitudePlugin, { type OpenClawPluginApiLike } from "./plugin.ts"
import type { BuildResult } from "./span-builder.ts"
import type { OtlpExportRequest } from "./types.ts"

function makeApi(): {
  api: OpenClawPluginApiLike
  fire: (hookName: string, event: unknown, ctx: unknown) => unknown[]
  hooks: () => string[]
  logs: string[]
} {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>()
  const logs: string[] = []
  const api: OpenClawPluginApiLike = {
    logger: {
      info: (m) => logs.push(`info ${m}`),
      warn: (m) => logs.push(`warn ${m}`),
      error: (m) => logs.push(`error ${m}`),
    },
    on: (hookName, handler) => {
      const list = handlers.get(hookName) ?? []
      list.push(handler as (event: unknown, ctx: unknown) => unknown)
      handlers.set(hookName, list)
    },
  }
  return {
    api,
    logs,
    hooks: () => Array.from(handlers.keys()),
    fire: (hookName, event, ctx) => (handlers.get(hookName) ?? []).map((h) => h(event, ctx)),
  }
}

function config(overrides: Partial<Config> = {}): Config {
  return {
    apiKey: "k",
    project: "p",
    baseUrl: "http://localhost:0",
    enabled: true,
    debug: true,
    allowConversationAccess: true,
    serviceName: "openclaw",
    tags: [],
    metadata: {},
    memory: true,
    memoryContent: true,
    toolDefinitions: true,
    maxContentChars: 1000,
    ...overrides,
  }
}

const ctx = {
  runId: "r1",
  sessionId: "s1",
  sessionKey: "agent:main:main",
  agentId: "main",
  trigger: "user",
  senderId: "U1",
}

describe("registerLatitudePlugin", () => {
  it("registers nothing and warns when credentials are missing", () => {
    const { api, logs } = makeApi()
    const spy = vi.spyOn(api, "on")
    registerLatitudePlugin(api, { config: config({ apiKey: "", enabled: false }) })
    expect(spy).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes("apiKey is empty"))).toBe(true)
  })

  it("reads credentials from api.pluginConfig", () => {
    const { api, hooks } = makeApi()
    api.pluginConfig = { apiKey: "k", project: "p", allowConversationAccess: true }
    registerLatitudePlugin(api, { transport: { enqueue: () => {}, flush: async () => {} } })
    expect(hooks()).toContain("llm_input")
  })

  it("subscribes to the current hook set and never to the removed before_agent_start", () => {
    const { api, hooks } = makeApi()
    registerLatitudePlugin(api, { config: config(), transport: { enqueue: () => {}, flush: async () => {} } })
    const names = hooks()
    for (const expected of [
      "llm_input",
      "llm_output",
      "agent_end",
      "model_call_started",
      "model_call_ended",
      "before_tool_call",
      "after_tool_call",
      "before_compaction",
      "after_compaction",
      "subagent_spawned",
      "subagent_ended",
      "session_start",
      "session_end",
      "message_received",
      "cron_changed",
      "gateway_stop",
    ]) {
      expect(names).toContain(expected)
    }
    expect(names).not.toContain("before_agent_start")
  })

  it("returns undefined from every handler so modifying hooks stay no-ops", () => {
    const { api, fire } = makeApi()
    registerLatitudePlugin(api, { config: config(), transport: { enqueue: () => {}, flush: async () => {} } })
    expect(fire("before_tool_call", { toolName: "exec", params: {}, runId: "r1", toolCallId: "t" }, ctx)).toEqual([
      undefined,
    ])
    expect(fire("message_received", { senderId: "U1", sessionKey: "k" }, {})).toEqual([undefined])
    expect(
      fire(
        "llm_input",
        {
          runId: "r1",
          sessionId: "s1",
          provider: "openai",
          model: "m",
          prompt: "hi",
          historyMessages: [],
          imagesCount: 0,
        },
        ctx,
      ),
    ).toEqual([undefined])
  })

  it("warns at startup when OpenClaw's own conversation gate is off", () => {
    const { api, logs } = makeApi()
    api.config = { plugins: { entries: { "@latitude-data/openclaw-telemetry": { hooks: {} } } } }
    registerLatitudePlugin(api, { config: config(), transport: { enqueue: () => {}, flush: async () => {} } })
    expect(logs.some((l) => l.startsWith("warn") && l.includes("hooks.allowConversationAccess is not true"))).toBe(true)
  })

  it("stays quiet about the gate when it is on or unknown", () => {
    const on = makeApi()
    on.api.config = {
      plugins: { entries: { "@latitude-data/openclaw-telemetry": { hooks: { allowConversationAccess: true } } } },
    }
    registerLatitudePlugin(on.api, { config: config(), transport: { enqueue: () => {}, flush: async () => {} } })
    const unknown = makeApi()
    registerLatitudePlugin(unknown.api, { config: config(), transport: { enqueue: () => {}, flush: async () => {} } })
    expect([...on.logs, ...unknown.logs].some((l) => l.includes("hooks.allowConversationAccess"))).toBe(false)
  })

  it("swallows handler errors and logs them through the host logger", () => {
    const { api, fire, logs } = makeApi()
    registerLatitudePlugin(api, { config: config(), transport: { enqueue: () => {}, flush: async () => {} } })
    expect(() => fire("llm_input", null, ctx)).not.toThrow()
    expect(logs.some((l) => l.startsWith("warn") && l.includes("llm_input handler failed"))).toBe(true)
  })

  it("builds the trace and hands a gated OTLP payload to the transport", () => {
    const { api, fire } = makeApi()
    const payloads: OtlpExportRequest[] = []
    const emitted: BuildResult[] = []
    registerLatitudePlugin(api, {
      config: config({ allowConversationAccess: false, serviceName: "my-agent" }),
      transport: { enqueue: (p) => payloads.push(p), flush: async () => {} },
      onEmit: (r) => emitted.push(r),
    })
    fire(
      "llm_input",
      {
        runId: "r1",
        sessionId: "s1",
        provider: "openai",
        model: "m",
        systemPrompt: "sys",
        prompt: "hi",
        historyMessages: [],
        imagesCount: 0,
      },
      ctx,
    )
    fire("model_call_started", { runId: "r1", callId: "c1", provider: "openai", model: "m" }, { runId: "r1" })
    fire(
      "model_call_ended",
      { runId: "r1", callId: "c1", provider: "openai", model: "m", outcome: "completed", durationMs: 5 },
      { runId: "r1" },
    )
    fire(
      "agent_end",
      {
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "yo" }],
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } },
            stopReason: "stop",
            timestamp: Date.now(),
          },
        ],
        success: true,
        durationMs: 10,
      },
      ctx,
    )
    fire("llm_output", { runId: "r1", sessionId: "s1", provider: "openai", model: "m", assistantTexts: ["yo"] }, ctx)

    expect(emitted).toHaveLength(1)
    expect(payloads).toHaveLength(1)
    const rs = payloads[0]?.resourceSpans[0]
    expect(rs?.resource.attributes.find((a) => a.key === "service.name")?.value.stringValue).toBe("my-agent")
    const spans = rs?.scopeSpans[0]?.spans ?? []
    expect(spans.map((s) => s.name).sort()).toEqual(["interaction", "llm_request"])
    for (const span of spans) {
      const keys = span.attributes.map((a) => a.key)
      expect(keys).not.toContain("gen_ai.input.messages")
      expect(keys).not.toContain("gen_ai.system_instructions")
      expect(keys).toContain("latitude.captured.content")
    }
    const chat = spans.find((s) => s.name === "llm_request")
    expect(chat?.attributes.find((a) => a.key === "gen_ai.usage.input_tokens")?.value.intValue).toBe("1")
  })

  it("flushes the transport on gateway_stop", async () => {
    const { api, fire } = makeApi()
    const flush = vi.fn(async () => {})
    registerLatitudePlugin(api, { config: config(), transport: { enqueue: () => {}, flush } })
    await Promise.all(fire("gateway_stop", {}, {}))
    expect(flush).toHaveBeenCalledOnce()
  })
})
