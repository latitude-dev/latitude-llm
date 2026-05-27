import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockActivities } = vi.hoisted(() => {
  const mockActivities = {
    loadAnalyzeSessionActivity: vi.fn(),
    hashAnalyzeSessionActivity: vi.fn(),
    checkAnalyzeSessionEligibilityActivity: vi.fn(),
    embedAnalyzeSessionTurnsActivity: vi.fn(),
    segmentAnalyzeSessionActivity: vi.fn(),
    detectAnalyzeSessionLabelsActivity: vi.fn(),
    persistAnalyzeSessionActivity: vi.fn(),
  }
  return { mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
  sleep: vi.fn(async () => undefined),
}))

import { sleep } from "@temporalio/workflow"
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
    mockActivities.segmentAnalyzeSessionActivity.mockName("segment").mockResolvedValue({ segments: [] })
    mockActivities.detectAnalyzeSessionLabelsActivity.mockName("label").mockResolvedValue({ sampled: true })
    mockActivities.persistAnalyzeSessionActivity
      .mockName("persist")
      .mockResolvedValue({ action: "recorded", status: "analyzed", momentCount: 0 })
  })

  it("runs named idempotent analysis activities in order", async () => {
    await expect(analyzeSessionWorkflow(input)).resolves.toEqual({
      action: "recorded",
      status: "analyzed",
      momentCount: 0,
    })

    expect(activityOrder()).toEqual(["load", "hash", "eligibility", "embed", "segment", "label", "persist"])
  })

  it("short-circuits hash-current sessions before expensive activities", async () => {
    mockActivities.checkAnalyzeSessionEligibilityActivity.mockResolvedValueOnce({
      eligible: false,
      reason: "hash_current",
    })

    await expect(analyzeSessionWorkflow(input)).resolves.toEqual({ action: "skipped", reason: "hash-current" })

    expect(activityOrder()).toEqual(["load", "hash", "eligibility"])
    expect(mockActivities.embedAnalyzeSessionTurnsActivity).not.toHaveBeenCalled()
    expect(mockActivities.persistAnalyzeSessionActivity).not.toHaveBeenCalled()
  })

  it("persists skipped ineligible sessions without expensive activities", async () => {
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

  it("preserves debounce before activity execution", async () => {
    await analyzeSessionWorkflow({ ...input, debounceMs: 123 })

    expect(sleep).toHaveBeenCalledWith(123)
    expect(mockActivities.loadAnalyzeSessionActivity).toHaveBeenCalled()
  })

  it("propagates failed activity errors", async () => {
    mockActivities.detectAnalyzeSessionLabelsActivity.mockRejectedValueOnce(new Error("label detection failed"))

    await expect(analyzeSessionWorkflow(input)).rejects.toThrow("label detection failed")

    expect(activityOrder()).toEqual(["load", "hash", "eligibility", "embed", "segment", "label"])
    expect(mockActivities.persistAnalyzeSessionActivity).not.toHaveBeenCalled()
  })
})
