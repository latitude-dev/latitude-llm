import { describe, expect, it } from "vitest"
import {
  draftToAlertDraft,
  draftWithKind,
  emptyAlertDraft,
  targetAlertDraft,
} from "./alert-form-helpers.ts"

const toolTarget = {
  type: "tool" as const,
  id: null,
  kind: "tool" as const,
  stream: "spans" as const,
  query: null,
  savedSearchId: null,
  filterSet: { name: [{ op: "eq" as const, value: "searchWeb" }] },
  metric: { kind: "count" as const },
}

describe("draftWithKind", () => {
  it("coerces non-count metrics to count when switching to escalating", () => {
    const draft = targetAlertDraft(toolTarget, {
      kind: "monitor.threshold",
      metric: { kind: "errorRate" },
    })

    const next = draftWithKind(draft, "monitor.escalating")

    expect(next.kind).toBe("monitor.escalating")
    expect(next.metric).toEqual({ kind: "count" })
  })

  it("keeps the metric when switching to threshold", () => {
    const draft = emptyAlertDraft({
      kind: "monitor.escalating",
      target: toolTarget,
      metric: { kind: "count" },
    })

    const next = draftWithKind(
      { ...draft, metric: { kind: "median", field: "duration" } },
      "monitor.threshold",
    )

    expect(next.kind).toBe("monitor.threshold")
    expect(next.metric).toEqual({ kind: "median", field: "duration" })
  })
})

describe("draftToAlertDraft", () => {
  it("maps error-rate expected presets to threshold rules", () => {
    const draft = targetAlertDraft(toolTarget, {
      kind: "monitor.threshold",
      metric: { kind: "errorRate" },
      comparison: "timesMoreThan",
      baselineKind: "expected",
      amount: 3,
      severity: "high",
    })

    expect(draftToAlertDraft(draft)).toMatchObject({
      kind: "monitor.threshold",
      severity: "high",
      condition: {
        trigger: "threshold",
        metric: { kind: "errorRate" },
        threshold: { mode: "expected", sensitivity: 3 },
      },
    })
  })

  it("maps count expected presets to escalating rules", () => {
    const draft = targetAlertDraft(toolTarget, {
      kind: "monitor.escalating",
      metric: { kind: "count" },
      comparison: "timesMoreThan",
      baselineKind: "expected",
      amount: 3,
      windowAmount: 15,
      windowUnit: "minutes",
      severity: "medium",
    })

    expect(draftToAlertDraft(draft)).toMatchObject({
      kind: "monitor.escalating",
      severity: "medium",
      condition: {
        trigger: "escalating",
        metric: { kind: "count" },
        threshold: { mode: "expected", sensitivity: 3 },
        window: { minutes: 15 },
      },
    })
  })
})
