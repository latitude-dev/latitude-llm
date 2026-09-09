import { readFileSync } from "node:fs"
import { beforeAll, describe, expect, it } from "vitest"
import type { SpanDetail } from "../../entities/span.ts"
import type { TransformContext } from "../transform.ts"
import { transformOtlpToSpans } from "../transform.ts"
import type { OtlpExportTraceServiceRequest } from "../types.ts"

// One Slack turn ("Run uname -a") captured from `@latitude-data/openclaw-telemetry`
// 0.1.0: interaction → two llm_request (tool call, then answer), the exec tool
// call and the session memory snapshot. Regenerate by driving the plugin's
// `registerLatitudePlugin` with a fake transport when its shape changes.
const FIXTURE = new URL("./fixtures/openclaw-plugin.json", import.meta.url)

const CONTEXT: TransformContext = {
  organizationId: "org_test",
  apiKeyId: "key_test",
  ingestedAt: new Date("2026-09-09T12:00:00Z"),
  defaultProjectId: "proj_test",
  projectIdBySlug: new Map(),
}

describe("OpenClaw Latitude plugin ingest", () => {
  let spans: SpanDetail[]
  const find = (name: string) => spans.find((s) => s.name === name)
  const calls = () => spans.filter((s) => s.name === "llm_request")

  beforeAll(() => {
    const payload = JSON.parse(readFileSync(FIXTURE, "utf8")) as OtlpExportTraceServiceRequest
    spans = transformOtlpToSpans(payload, CONTEXT).spans as SpanDetail[]
  })

  it("classifies every span by gen_ai.operation.name", () => {
    expect(find("interaction")?.operation).toBe("invoke_agent")
    expect(calls().map((s) => s.operation)).toEqual(["chat", "chat"])
    expect(find("tool_call:exec")?.operation).toBe("execute_tool")
    expect(find("search_memory")?.operation).toBe("search_memory")
  })

  it("reads per-call usage, reasoning, provider-reported cost, TTFT and streaming", () => {
    const [first, second] = calls()
    expect(first?.tokensInput).toBe(1200)
    expect(first?.tokensCacheRead).toBe(800)
    expect(first?.tokensReasoning).toBe(25)
    expect(first?.tokensOutput).toBe(15)
    expect(first?.costTotalMicrocents).toBe(180_000)
    expect(first?.costSource).toBe("provider_reported")
    expect(first?.timeToFirstTokenNs).toBe(350_000_000)
    expect(first?.isStreaming).toBe(true)
    expect(first?.finishReasons).toEqual(["tool_calls"])
    expect(second?.finishReasons).toEqual(["stop"])
    expect(second?.costTotalMicrocents).toBe(170_000)
  })

  it("keeps the root free of usage so the rollup counts each call once", () => {
    expect(find("interaction")?.tokensInput).toBe(0)
    expect(find("interaction")?.tokensOutput).toBe(0)
    expect(find("interaction")?.costTotalMicrocents).toBe(0)
  })

  it("parses the conversation, system prompt and tool definitions on the chat spans", () => {
    const [first, second] = calls()
    expect(first?.systemInstructions.map((p) => p.content)).toEqual(["You are OpenClaw."])
    expect(first?.toolDefinitions.map((t) => t.name)).toEqual(["exec", "memory_search"])
    expect(first?.outputMessages[0]?.parts.map((p) => p.type)).toEqual(["reasoning", "tool_call"])
    expect(second?.inputMessages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "tool"])
    expect(second?.outputMessages[0]?.role).toBe("assistant")
    expect(second?.outputMessages[0]?.parts.map((p) => p.content)).toEqual(["Kernel 6.8.0."])
  })

  it("resolves the tool call and the memory read", () => {
    const tool = find("tool_call:exec")
    expect(tool?.kind).toBe("client")
    expect(tool?.toolName).toBe("exec")
    expect(tool?.toolCallId).toBe("call_1")
    expect(tool?.toolInput).toBe('{"command":"uname -a"}')
    expect(find("search_memory")?.kind).toBe("client")
  })

  it("stamps session, user, agent, tags and metadata on every span", () => {
    for (const span of spans) {
      expect(span.sessionId).toBe("sess-1")
      expect(span.userId).toBe("U0ALEX")
      expect(span.agentName).toBe("main")
      expect(span.tags).toEqual(["openclaw", "slack", "main"])
      expect(span.metadata["openclaw.sender.name"]).toBe("Alex")
      expect(span.metadata["openclaw.channel"]).toBe("slack")
    }
  })
})
