import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockActivities, signalState, patchedState } = vi.hoisted(() => {
  const mockActivities = {
    loadAnalyzeSessionActivity: vi.fn(),
    hashAnalyzeSessionActivity: vi.fn(),
    checkAnalyzeSessionEligibilityActivity: vi.fn(),
    embedAnalyzeSessionTurnsActivity: vi.fn(),
    segmentAnalyzeSessionActivity: vi.fn(),
    detectAnalyzeSessionLabelsActivity: vi.fn(),
    persistAnalyzeSessionActivity: vi.fn(),
  }
  const signalState: { handler: ((input: { readonly debounceMs?: number }) => void) | undefined } = {
    handler: undefined,
  }
  const patchedState: { default: boolean; readonly byId: Record<string, boolean> } = {
    default: true,
    byId: {},
  }
  return { mockActivities, signalState, patchedState }
})

vi.mock("@temporalio/workflow", () => ({
  defineSignal: vi.fn((name: string) => ({ name })),
  patched: (id: string) => patchedState.byId[id] ?? patchedState.default,
  proxyActivities: () => mockActivities,
  setHandler: vi.fn((_signal, handler) => {
    signalState.handler = handler
  }),
  sleep: vi.fn(async () => undefined),
}))

import { setHandler, sleep } from "@temporalio/workflow"
import { analyzeSessionWorkflow } from "./analyze-session-workflow.ts"

const input = {
  organizationId: "o".repeat(24),
  projectId: "p".repeat(24),
  sessionId: "session-1",
  triggeringTraceId: "t".repeat(32),
  triggeringStartTime: "2026-01-01T00:00:00.000Z",
  reason: "trace_completed" as const,
}

const activityOrder = () =>
  [
    mockActivities.loadAnalyzeSessionActivity,
    mockActivities.hashAnalyzeSessionActivity,
    mockActivities.checkAnalyzeSessionEligibilityActivity,
    mockActivities.embedAnalyzeSessionTurnsActivity,
    mockActivities.segmentAnalyzeSessionActivity,
    mockActivities.detectAnalyzeSessionLabelsActivity,
    mockActivities.persistAnalyzeSessionActivity,
  ]
    .filter((mock) => mock.mock.calls.length > 0)
    .map((mock) => mock.getMockName())

describe("analyzeSessionWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signalState.handler = undefined
    patchedState.default = true
    for (const id of Object.keys(patchedState.byId)) {
      delete patchedState.byId[id]
    }
    mockActivities.segmentAnalyzeSessionActivity.mockName("segment").mockResolvedValue({ replayed: true })
    mockActivities.detectAnalyzeSessionLabelsActivity.mockName("label").mockResolvedValue({ replayed: true })
    mockActivities.loadAnalyzeSessionActivity.mockName("load").mockResolvedValue({ found: true, rawMessages: [] })
    mockActivities.hashAnalyzeSessionActivity.mockName("hash").mockResolvedValue({
      analysisHash: "h".repeat(64),
      document: "0. user: hello\n\n1. assistant: hi there friend",
      messages: [
        { index: 0, role: "user", text: "hello" },
        { index: 1, role: "assistant", text: "hi there friend" },
      ],
      hashCurrent: false,
    })
    mockActivities.checkAnalyzeSessionEligibilityActivity
      .mockName("eligibility")
      .mockResolvedValue({ eligible: true, reason: "eligible" })
    mockActivities.embedAnalyzeSessionTurnsActivity.mockName("embed").mockResolvedValue({ turns: [] })
    mockActivities.persistAnalyzeSessionActivity
      .mockName("persist")
      .mockResolvedValue({ action: "recorded", status: "analyzed", momentCount: 0 })
  })

  it("registers the traceCompleted signal handler so signalWithStart does not break running workflows", async () => {
    await analyzeSessionWorkflow(input)

    expect(setHandler).toHaveBeenCalledWith({ name: "traceCompleted" }, expect.any(Function))
  })

  it("runs one persist activity per pass for new executions", async () => {
    await expect(analyzeSessionWorkflow(input)).resolves.toEqual({
      action: "recorded",
      status: "analyzed",
      momentCount: 0,
    })

    expect(activityOrder()).toEqual(["persist"])
    expect(mockActivities.loadAnalyzeSessionActivity).not.toHaveBeenCalled()
    expect(mockActivities.hashAnalyzeSessionActivity).not.toHaveBeenCalled()
    expect(mockActivities.checkAnalyzeSessionEligibilityActivity).not.toHaveBeenCalled()
    expect(mockActivities.embedAnalyzeSessionTurnsActivity).not.toHaveBeenCalled()
  })

  it("replays the legacy segment + label warm-up sequence for pre-patch executions", async () => {
    patchedState.default = false

    await expect(analyzeSessionWorkflow(input)).resolves.toEqual({
      action: "recorded",
      status: "analyzed",
      momentCount: 0,
    })

    expect(activityOrder()).toEqual(["load", "hash", "eligibility", "embed", "segment", "label", "persist"])
  })

  it("short-circuits hash-current sessions before expensive activities during legacy replay", async () => {
    patchedState.byId["analyze-session-persist-only-v1"] = false
    mockActivities.checkAnalyzeSessionEligibilityActivity.mockResolvedValueOnce({
      eligible: false,
      reason: "hash_current",
    })

    await expect(analyzeSessionWorkflow(input)).resolves.toEqual({ action: "skipped", reason: "hash-current" })

    expect(activityOrder()).toEqual(["load", "hash", "eligibility"])
    expect(mockActivities.embedAnalyzeSessionTurnsActivity).not.toHaveBeenCalled()
    expect(mockActivities.persistAnalyzeSessionActivity).not.toHaveBeenCalled()
  })

  it("persists skipped ineligible sessions without expensive activities during legacy replay", async () => {
    patchedState.byId["analyze-session-persist-only-v1"] = false
    mockActivities.checkAnalyzeSessionEligibilityActivity.mockResolvedValueOnce({
      eligible: false,
      reason: "too_short",
    })

    await expect(analyzeSessionWorkflow(input)).resolves.toEqual({
      action: "recorded",
      status: "analyzed",
      momentCount: 0,
    })

    expect(activityOrder()).toEqual(["load", "hash", "eligibility", "persist"])
    expect(mockActivities.embedAnalyzeSessionTurnsActivity).not.toHaveBeenCalled()
  })

  it("skips the internal debounce for post-patch executions (session-end now owns it)", async () => {
    await analyzeSessionWorkflow({ ...input, debounceMs: 123 })

    expect(sleep).not.toHaveBeenCalled()
    expect(mockActivities.persistAnalyzeSessionActivity).toHaveBeenCalledOnce()
    expect(mockActivities.loadAnalyzeSessionActivity).not.toHaveBeenCalled()
  })

  it("replays the internal debounce for pre-patch executions", async () => {
    patchedState.default = false

    await analyzeSessionWorkflow({ ...input, debounceMs: 123 })

    expect(sleep).toHaveBeenCalledWith(123)
    expect(mockActivities.loadAnalyzeSessionActivity).toHaveBeenCalled()
  })

  it("runs another analysis pass when traceCompleted arrives during an in-flight pass", async () => {
    mockActivities.persistAnalyzeSessionActivity.mockImplementationOnce(async () => {
      signalState.handler?.({ debounceMs: 0 })
      return { action: "recorded", status: "analyzed", momentCount: 0 }
    })

    await expect(analyzeSessionWorkflow(input)).resolves.toEqual({
      action: "recorded",
      status: "analyzed",
      momentCount: 0,
    })

    expect(mockActivities.persistAnalyzeSessionActivity).toHaveBeenCalledTimes(2)
    expect(mockActivities.loadAnalyzeSessionActivity).not.toHaveBeenCalled()
    expect(mockActivities.hashAnalyzeSessionActivity).not.toHaveBeenCalled()
  })

  it("falls through to persist when the embedding warm-up fails during legacy replay", async () => {
    patchedState.byId["analyze-session-persist-only-v1"] = false
    mockActivities.embedAnalyzeSessionTurnsActivity.mockRejectedValueOnce(new Error("embedding warm-up failed"))

    await expect(analyzeSessionWorkflow(input)).resolves.toEqual({
      action: "recorded",
      status: "analyzed",
      momentCount: 0,
    })

    expect(activityOrder()).toEqual(["load", "hash", "eligibility", "embed", "persist"])
  })

  it("propagates persist activity errors", async () => {
    mockActivities.persistAnalyzeSessionActivity.mockRejectedValueOnce(new Error("persist failed"))

    await expect(analyzeSessionWorkflow(input)).rejects.toThrow("persist failed")
  })
})
