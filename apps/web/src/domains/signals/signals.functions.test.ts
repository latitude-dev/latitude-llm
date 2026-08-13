import { SignalId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { toSignalRowMetricRecord } from "./signals.functions.ts"

describe("toSignalRowMetricRecord", () => {
  it("serializes occurrence timestamps from the selected score window", () => {
    const firstSeenAt = new Date("2026-07-01T10:00:00.000Z")
    const lastSeenAt = new Date("2026-07-12T15:30:00.000Z")

    expect(
      toSignalRowMetricRecord({
        metric: {
          signalId: SignalId("sig_123"),
          occurrences: 4,
          affectedSessions: 2,
          firstSeenAt,
          lastSeenAt,
        },
        totalSessions: 8,
        trend: [],
      }),
    ).toEqual({
      occurrences: 4,
      firstSeenAt: firstSeenAt.toISOString(),
      lastSeenAt: lastSeenAt.toISOString(),
      affectedSessionsPercent: 0.25,
      trend: [],
    })
  })

  it("keeps zero-occurrence rows timestamp-free", () => {
    expect(toSignalRowMetricRecord({ metric: undefined, totalSessions: 8, trend: [] })).toEqual({
      occurrences: 0,
      firstSeenAt: null,
      lastSeenAt: null,
      affectedSessionsPercent: 0,
      trend: [],
    })
  })
})
