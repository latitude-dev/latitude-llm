import { describe, expect, it } from "vitest"
import { PiSpanBuilder } from "./span-builder.ts"
import type { PiContext, RuntimeConfig, UserIdentity } from "./types.ts"

const config: RuntimeConfig = {
  apiKey: "lat_test",
  project: "default-project",
  baseUrl: "http://localhost:3002",
  enabled: true,
  debug: false,
  allowConversationAccess: true,
  tags: ["pi"],
  metadata: {},
  configSource: "file",
}

const identity: UserIdentity = {
  userId: "owner@example.com",
  email: "owner@example.com",
  userName: "owner",
  fullName: "Owner",
  hostName: "host",
}

function ctx(): PiContext {
  return {
    cwd: "/repo/app",
    sessionManager: {
      getSessionId: () => "sess-1",
      getSessionFile: () => "/tmp/session.jsonl",
      getSessionName: () => "Build feature",
    },
  }
}

describe("PiSpanBuilder", () => {
  it("emits interaction, llm_request, and tool_execution spans with Latitude-friendly attributes", () => {
    const builder = new PiSpanBuilder(config, identity)

    builder.onBeforeAgentStart({ prompt: "read package.json", systemPrompt: "You are pi." }, ctx())
    builder.onTurnStart({ turnIndex: 0, timestamp: 1_000 }, ctx())
    builder.onContext({ messages: [{ role: "user", content: "read package.json" }] })
    builder.onBeforeProviderRequest({ payload: { model: "claude-sonnet-4-5", max_tokens: 1000, stream: true } })
    builder.onMessageEnd({
      message: {
        role: "assistant",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "package.json" } }],
        usage: { input: 120, output: 14, cacheRead: 5, cacheWrite: 0, totalTokens: 139 },
        stopReason: "toolUse",
        timestamp: 1_100,
      },
    })

    builder.onToolExecutionStart({ toolCallId: "tool-1", toolName: "read", args: { path: "package.json" } }, ctx())
    builder.onToolExecutionEnd({
      toolCallId: "tool-1",
      toolName: "read",
      isError: false,
      result: {
        content: [{ type: "text", text: '{"name":"app"}' }],
        details: { path: "package.json" },
      },
    })

    const result = builder.onAgentEnd({ messages: [] }, ctx())
    expect(result).toBeDefined()
    const spans = result?.spans ?? []
    expect(spans).toHaveLength(3)

    const interaction = spans.find((span) => span.name === "interaction")
    const llm = spans.find((span) => span.name === "llm_request")
    const tool = spans.find((span) => span.name === "tool_call:read")

    expect(interaction?.attrs["span.type"]).toBe("interaction")
    expect(interaction?.attrs["user_prompt:gated"]).toBe("read package.json")
    expect(llm?.parentSpanId).toBe(interaction?.spanId)
    expect(llm?.attrs["span.type"]).toBe("llm_request")
    expect(llm?.attrs["gen_ai.operation.name"]).toBe("chat")
    expect(llm?.attrs["gen_ai.provider.name"]).toBe("anthropic")
    expect(llm?.attrs["gen_ai.request.model"]).toBe("claude-sonnet-4-5")
    expect(llm?.attrs["gen_ai.usage.input_tokens"]).toBe(120)
    expect(llm?.attrs["gen_ai.usage.output_tokens"]).toBe(14)
    expect(llm?.attrs["gen_ai.system_instructions:gated"]).toEqual([{ type: "text", content: "You are pi." }])
    expect(llm?.attrs["gen_ai.input.messages:gated"]).toEqual([
      { role: "user", parts: [{ type: "text", content: "read package.json" }] },
    ])
    expect(llm?.attrs["gen_ai.output.messages:gated"]).toEqual([
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "tool-1", name: "read", arguments: { path: "package.json" } }],
      },
    ])

    expect(tool?.parentSpanId).toBe(interaction?.spanId)
    expect(tool?.attrs["span.type"]).toBe("tool_execution")
    expect(tool?.attrs["gen_ai.operation.name"]).toBe("execute_tool")
    expect(tool?.attrs["gen_ai.tool.name"]).toBe("read")
    expect(tool?.attrs["gen_ai.tool.call.arguments:gated"]).toEqual({ path: "package.json" })
    expect(tool?.attrs["gen_ai.tool.call.result:gated"]).toEqual({
      content: '{"name":"app"}',
      details: { path: "package.json" },
    })
  })

  it("uses context messages for later tool-loop model calls", () => {
    const builder = new PiSpanBuilder(config, identity)
    builder.onBeforeAgentStart({ prompt: "run a command" }, ctx())

    builder.onTurnStart({ turnIndex: 0 }, ctx())
    builder.onContext({ messages: [{ role: "user", content: "run a command" }] })
    builder.onMessageEnd({
      message: {
        role: "assistant",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        content: [{ type: "toolCall", id: "bash-1", name: "bash", arguments: { command: "pwd" } }],
        usage: {},
        stopReason: "toolUse",
      },
    })
    builder.onToolExecutionStart({ toolCallId: "bash-1", toolName: "bash", args: { command: "pwd" } }, ctx())
    builder.onToolExecutionEnd({
      toolCallId: "bash-1",
      toolName: "bash",
      result: { content: [{ type: "text", text: "/repo/app" }] },
      isError: false,
    })

    builder.onTurnStart({ turnIndex: 1 }, ctx())
    builder.onContext({
      messages: [
        { role: "user", content: "run a command" },
        {
          role: "assistant",
          content: [{ type: "toolCall", id: "bash-1", name: "bash", arguments: { command: "pwd" } }],
        },
        { role: "toolResult", toolCallId: "bash-1", toolName: "bash", content: [{ type: "text", text: "/repo/app" }] },
      ],
    })
    builder.onMessageEnd({
      message: {
        role: "assistant",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        content: [{ type: "text", text: "You are in /repo/app." }],
        usage: {},
        stopReason: "stop",
      },
    })

    const result = builder.onAgentEnd({ messages: [] }, ctx())
    const calls = result?.spans.filter((span) => span.name === "llm_request") ?? []
    expect(calls).toHaveLength(2)
    expect(calls[1]?.attrs["gen_ai.input.messages:gated"]).toEqual([
      { role: "user", parts: [{ type: "text", content: "run a command" }] },
      { role: "assistant", parts: [{ type: "tool_call", id: "bash-1", name: "bash", arguments: { command: "pwd" } }] },
      { role: "tool", parts: [{ type: "tool_call_response", id: "bash-1", response: "/repo/app" }] },
    ])
  })
})
