import { describe, expect, it, vi } from "vitest"
import { AGENT_SCORE_REFRESH_THROTTLE_MS } from "../../../../../../domains/agent-score/agent-score.constants.ts"
import type { AgentScoreExplanationRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import {
  agentScoreExplanationForSnapshot,
  agentScoreRefreshCompleted,
  agentScoreRefreshPollDelayMs,
  agentScoreSnapshotEvidenceCompleted,
  agentScoreSnapshotMarker,
  agentVitalityIsLoading,
  isCurrentAgentScoreSnapshot,
  isStaleAgentScoreSnapshot,
  waitForAgentScoreRefresh,
} from "./agent-score-refresh.ts"

type Explanation = NonNullable<AgentScoreExplanationRecord["explanation"]>

const snapshot = {
  date: "2026-09-12",
  score: 66,
  createdAt: "2026-09-12T03:00:00.000Z",
}

const explanation = (date: string, status: "published" | "withheld", computedAt: string) =>
  ({ date, window: { to: `${date}T23:59:59.999Z` }, publication: { status }, computedAt }) as unknown as Explanation

describe("agentScoreExplanationForSnapshot", () => {
  const explanation = {
    date: "2026-09-12",
    scoringVersion: "agent-score-v1-provisional",
    publication: { status: "published" },
    window: { to: "2026-09-12T04:00:00.000Z" },
  } as unknown as Explanation
  const snapshot = { scoringVersion: "agent-score-v1-provisional" }

  it("keeps an explanation computed for the requested snapshot", () => {
    expect(agentScoreExplanationForSnapshot({ explanation, date: "2026-09-12", snapshot })).toBe(explanation)
  })

  it("keeps an explanation when no snapshot was published", () => {
    expect(agentScoreExplanationForSnapshot({ explanation, date: "2026-09-12", snapshot: null })).toBe(explanation)
  })

  it("hides a cached explanation from an earlier score date", () => {
    expect(agentScoreExplanationForSnapshot({ explanation, date: "2026-09-13", snapshot })).toBeNull()
  })

  it("keeps a latest available score's explanation when it matches that score date", () => {
    const latestExplanation = { ...explanation, date: "2026-09-11" }

    expect(agentScoreExplanationForSnapshot({ explanation: latestExplanation, date: "2026-09-11", snapshot })).toBe(
      latestExplanation,
    )
  })

  it("hides a cached explanation from a different scoring version", () => {
    expect(
      agentScoreExplanationForSnapshot({
        explanation: { ...explanation, scoringVersion: "agent-score-v2-provisional" },
        date: "2026-09-12",
        snapshot,
      }),
    ).toBeNull()
  })
})

describe("agentScoreSnapshotEvidenceCompleted", () => {
  const snapshotExplanation = { computedAt: "2026-09-15T04:00:00.000Z" } as unknown as Explanation

  it("is done when no backfill was needed", () => {
    expect(
      agentScoreSnapshotEvidenceCompleted({
        needsSnapshotEvidence: false,
        previousSnapshotExplanationTime: undefined,
        snapshotExplanation: null,
      }),
    ).toBe(true)
  })

  it("waits while the backfilled evidence has not arrived", () => {
    expect(
      agentScoreSnapshotEvidenceCompleted({
        needsSnapshotEvidence: true,
        previousSnapshotExplanationTime: undefined,
        snapshotExplanation: null,
      }),
    ).toBe(false)
  })

  it("waits while the evidence timestamp is unchanged", () => {
    expect(
      agentScoreSnapshotEvidenceCompleted({
        needsSnapshotEvidence: true,
        previousSnapshotExplanationTime: "2026-09-15T04:00:00.000Z",
        snapshotExplanation,
      }),
    ).toBe(false)
  })

  it("finishes when the backfilled evidence arrives", () => {
    expect(
      agentScoreSnapshotEvidenceCompleted({
        needsSnapshotEvidence: true,
        previousSnapshotExplanationTime: undefined,
        snapshotExplanation,
      }),
    ).toBe(true)
  })
})

describe("agentScoreRefreshPollDelayMs", () => {
  it("outlasts the publish throttle so the retry it suggests is one the queue accepts", async () => {
    let waited = 0
    const refetch = vi.fn().mockResolvedValue("before")
    const wait = vi.fn().mockImplementation(async (duration: number) => {
      waited += duration
    })

    await expect(waitForAgentScoreRefresh({ previousMarker: "before", refetch, wait })).resolves.toBe(false)

    expect(waited).toBeGreaterThan(AGENT_SCORE_REFRESH_THROTTLE_MS)
  })

  it("watches closely while a short run can still land, then backs off", () => {
    expect(agentScoreRefreshPollDelayMs(0)).toBe(2_000)
    expect(agentScoreRefreshPollDelayMs(14)).toBe(2_000)
    expect(agentScoreRefreshPollDelayMs(15)).toBe(10_000)
  })
})

describe("waitForAgentScoreRefresh", () => {
  it("keeps polling until the refreshed result arrives", async () => {
    const refetch = vi.fn().mockResolvedValueOnce("before").mockResolvedValueOnce("after")
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(
      waitForAgentScoreRefresh({ previousMarker: "before", refetch, attempts: 3, delayMs: () => 1, wait }),
    ).resolves.toBe(true)
    expect(refetch).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledTimes(1)
  })

  it("stops after the polling limit when nothing changes", async () => {
    const refetch = vi.fn().mockResolvedValue("before")
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(
      waitForAgentScoreRefresh({ previousMarker: "before", refetch, attempts: 2, delayMs: () => 1, wait }),
    ).resolves.toBe(false)
    expect(refetch).toHaveBeenCalledTimes(2)
  })
})

describe("isCurrentAgentScoreSnapshot", () => {
  it("does not treat a latest-available fallback as today’s snapshot", () => {
    expect(isCurrentAgentScoreSnapshot({ date: "2026-09-11" }, "2026-09-12")).toBe(false)
    expect(isCurrentAgentScoreSnapshot({ date: "2026-09-12" }, "2026-09-12")).toBe(true)
    expect(isStaleAgentScoreSnapshot({ date: "2026-09-11" }, "2026-09-12")).toBe(true)
    expect(isStaleAgentScoreSnapshot(null, "2026-09-12")).toBe(false)
  })
})

describe("agentScoreRefreshCompleted", () => {
  const previousSnapshotMarker = agentScoreSnapshotMarker(null)
  const previousExplanationTime = "2026-09-12T02:00:00.000Z"

  it("waits for today's snapshot when a published explanation arrives first", () => {
    expect(
      agentScoreRefreshCompleted({
        previousSnapshotMarker,
        previousExplanationTime,
        date: "2026-09-12",
        snapshot: null,
        explanation: explanation("2026-09-12", "published", "2026-09-12T03:00:00.000Z"),
      }),
    ).toBe(false)
  })

  it("finishes for a changed withheld explanation from today only", () => {
    expect(
      agentScoreRefreshCompleted({
        previousSnapshotMarker,
        previousExplanationTime,
        date: "2026-09-12",
        snapshot: null,
        explanation: explanation("2026-09-12", "withheld", "2026-09-12T03:00:00.000Z"),
      }),
    ).toBe(true)
    expect(
      agentScoreRefreshCompleted({
        previousSnapshotMarker,
        previousExplanationTime,
        date: "2026-09-12",
        snapshot: null,
        explanation: explanation("2026-09-11", "withheld", "2026-09-12T03:00:00.000Z"),
      }),
    ).toBe(false)
  })

  it("finishes when the queued date matches the published snapshot", () => {
    expect(
      agentScoreRefreshCompleted({
        previousSnapshotMarker,
        previousExplanationTime,
        date: "2026-09-12",
        snapshot,
        explanation: explanation("2026-09-12", "published", "2026-09-12T03:00:00.000Z"),
      }),
    ).toBe(true)
  })

  it("does not finish from unrelated or missing evidence when today's snapshot is unchanged", () => {
    const currentSnapshotMarker = agentScoreSnapshotMarker(snapshot)
    expect(
      agentScoreRefreshCompleted({
        previousSnapshotMarker: currentSnapshotMarker,
        previousExplanationTime,
        date: "2026-09-12",
        snapshot,
        explanation: explanation("2026-09-11", "withheld", "2026-09-12T03:00:00.000Z"),
      }),
    ).toBe(false)
    expect(
      agentScoreRefreshCompleted({
        previousSnapshotMarker: currentSnapshotMarker,
        previousExplanationTime,
        date: "2026-09-12",
        snapshot,
        explanation: null,
      }),
    ).toBe(false)
  })

  it("finishes when today's evidence changes beside an unchanged current snapshot", () => {
    expect(
      agentScoreRefreshCompleted({
        previousSnapshotMarker: agentScoreSnapshotMarker(snapshot),
        previousExplanationTime,
        date: "2026-09-12",
        snapshot,
        explanation: explanation("2026-09-12", "published", "2026-09-12T03:00:00.000Z"),
      }),
    ).toBe(true)
  })

  it("keeps the queued date when the server date changes at UTC midnight", () => {
    const queuedDate = "2026-09-12"
    const currentServerDate = "2026-09-13"
    const withheldExplanation = {
      date: queuedDate,
      window: { to: "2026-09-13T00:00:00.000Z" },
      publication: { status: "withheld" },
      computedAt: "2026-09-13T00:01:00.000Z",
    } as unknown as Explanation

    expect(isCurrentAgentScoreSnapshot({ date: queuedDate }, currentServerDate)).toBe(false)
    expect(
      agentScoreExplanationForSnapshot({ explanation: withheldExplanation, date: queuedDate, snapshot: null }),
    ).toBe(withheldExplanation)
    expect(
      agentScoreRefreshCompleted({
        previousSnapshotMarker,
        previousExplanationTime,
        date: queuedDate,
        snapshot: null,
        explanation: withheldExplanation,
      }),
    ).toBe(true)
  })
})

describe("agentVitalityIsLoading", () => {
  it("keeps the latest score visible while a refresh runs", () => {
    expect(agentVitalityIsLoading(snapshot, true)).toBe(false)
    expect(agentVitalityIsLoading(null, true)).toBe(true)
  })
})
