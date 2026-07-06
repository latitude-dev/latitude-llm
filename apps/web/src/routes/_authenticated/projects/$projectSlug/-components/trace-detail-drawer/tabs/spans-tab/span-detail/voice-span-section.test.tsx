// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { isVoiceSpan, VoiceSpanSection } from "./voice-span-section.tsx"

function makeSpan(overrides: Partial<SpanDetailRecord>): SpanDetailRecord {
  return {
    organizationId: "org",
    projectId: "proj",
    traceId: "trace",
    spanId: "span",
    parentSpanId: "",
    simulationId: "",
    name: "voice",
    serviceName: "svc",
    kind: "internal",
    statusCode: "ok",
    statusMessage: "",
    operation: "transcribe",
    provider: "openai",
    model: "whisper-1",
    toolName: "",
    toolNames: [],
    tokensInput: 0,
    tokensOutput: 0,
    costTotalMicrocents: 0,
    timeToFirstTokenNs: 0,
    isStreaming: false,
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:00:01.000Z",
    ingestedAt: "2026-01-01T00:00:00.000Z",
    sessionId: "",
    userId: "",
    apiKeyId: "",
    responseModel: "",
    traceFlags: 0,
    traceState: "",
    errorType: "",
    tags: [],
    metadata: {},
    eventsJson: "[]",
    linksJson: "[]",
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costIsEstimated: false,
    responseId: "",
    finishReasons: [],
    attrString: {},
    attrInt: {},
    attrFloat: {},
    attrBool: {},
    resourceString: {},
    scopeName: "",
    scopeVersion: "",
    systemInstructions: [],
    toolDefinitions: [],
    toolCallId: "",
    toolInput: "",
    toolOutput: "",
    inputMessages: [],
    outputMessages: [],
    ...overrides,
  }
}

describe("isVoiceSpan", () => {
  it("detects transcribe and speech operations", () => {
    expect(isVoiceSpan(makeSpan({ operation: "transcribe" }))).toBe(true)
    expect(isVoiceSpan(makeSpan({ operation: "speech" }))).toBe(true)
    expect(isVoiceSpan(makeSpan({ operation: "chat" }))).toBe(false)
  })
})

describe("VoiceSpanSection", () => {
  it("renders audio controls for input and transcript text in output", async () => {
    render(
      <VoiceSpanSection
        span={makeSpan({
          inputMessages: [
            { role: "user", parts: [{ type: "uri", modality: "audio", uri: "https://example.com/in.mp3" }] },
          ],
          outputMessages: [
            {
              role: "assistant",
              parts: [{ type: "text", content: "hello from speech" }],
            },
          ],
        })}
      />,
    )

    expect(screen.getByText("Input")).toBeTruthy()
    expect(screen.getByText("Output")).toBeTruthy()
    expect(screen.getByText("Speech to text")).toBeTruthy()

    const audio = document.querySelector("audio")
    expect(audio).not.toBeNull()
    expect(audio?.getAttribute("src")).toBe("https://example.com/in.mp3")

    await waitFor(() => {
      expect(screen.getByText("hello from speech")).toBeTruthy()
    })
  })

  it("renders transcript text without audio when only text is present", async () => {
    render(
      <VoiceSpanSection
        span={makeSpan({
          outputMessages: [{ role: "assistant", parts: [{ type: "text", content: "spoken question" }] }],
        })}
      />,
    )

    expect(screen.getByText("Output")).toBeTruthy()
    expect(document.querySelector("audio")).toBeNull()

    await waitFor(() => {
      expect(screen.getByText("spoken question")).toBeTruthy()
    })
  })
})
