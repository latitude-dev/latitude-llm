import { cuidSchema } from "@domain/shared"
import { createSeedScope, SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID, seedTraceHex } from "@domain/shared/seeding"
import { demoSeedTraceSlots } from "@platform/db-clickhouse/seeding"
import { describe, expect, it } from "vitest"
import { buildTraceIdRemap, mapClickHouseRow, mapObservationId } from "./demo-project-snapshot.ts"

const SOURCE_PROJECT_ID = "yvl1e78evmwfs2mosyjb08rc"
const TARGET_PROJECT_ID = "an3s1qhl5twcq2nbkajayw1u"

describe("buildTraceIdRemap", () => {
  it("maps every demo trace slot from the source project's id to the target's", () => {
    const remap = buildTraceIdRemap(SOURCE_PROJECT_ID, TARGET_PROJECT_ID)

    expect(remap.size).toEqual(demoSeedTraceSlots.length)
    for (const slot of demoSeedTraceSlots) {
      const source = seedTraceHex(SOURCE_PROJECT_ID, slot.traceKey, slot.index)
      const target = seedTraceHex(TARGET_PROJECT_ID, slot.traceKey, slot.index)
      expect(remap.get(source)).toEqual(target)
    }
  })

  it("leaves ids that aren't seeded trace slots untouched (literal session ids)", () => {
    const remap = buildTraceIdRemap(SOURCE_PROJECT_ID, TARGET_PROJECT_ID)
    expect(remap.has("session-anthropic-demo")).toBe(false)
    expect(remap.has("seed-large-conversation-1")).toBe(false)
  })

  it("is empty when source and target projects are the same", () => {
    expect(buildTraceIdRemap(SOURCE_PROJECT_ID, SOURCE_PROJECT_ID).size).toEqual(0)
  })
})

describe("mapObservationId", () => {
  const scope = createSeedScope({
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    timelineAnchor: new Date("2026-06-16T12:00:00.000Z"),
    queueAssigneeUserIds: [],
    apiKeyId: SEED_API_KEY_ID,
  })

  // Regression: a 32-char id fails `taxonomyMomentObservationSchema.observationId`
  // (an exact-24 cuid), so every gardening read of an imported demo observation threw.
  it("produces a cuid-width (24-char) id the observation schema accepts", () => {
    const mapped = mapObservationId("a".repeat(64), scope)
    expect(typeof mapped).toBe("string")
    expect((mapped as string).length).toBe(24)
    expect(() => cuidSchema.parse(mapped)).not.toThrow()
  })

  it("is deterministic and distinct per source id", () => {
    expect(mapObservationId("obs-1", scope)).toEqual(mapObservationId("obs-1", scope))
    expect(mapObservationId("obs-1", scope)).not.toEqual(mapObservationId("obs-2", scope))
  })

  it("passes non-string values through untouched", () => {
    expect(mapObservationId(undefined, scope)).toBeUndefined()
    expect(mapObservationId(42, scope)).toBe(42)
  })
})

describe("mapClickHouseRow observation timestamps", () => {
  const baseInput = {
    scope: createSeedScope({
      organizationId: SEED_ORG_ID,
      projectId: SEED_PROJECT_ID,
      timelineAnchor: new Date("2026-06-26T12:00:00.000Z"),
      queueAssigneeUserIds: [],
      apiKeyId: SEED_API_KEY_ID,
    }),
    deltaMs: 0,
    mapClusterId: (id: string) => id,
    mapRunId: (id: string) => id,
    traceIdRemap: new Map<string, string>(),
  }

  // Snapshot observations carry a bunched, source-build timestamp; the session's
  // analysis row carries the real (spread) session time.
  const OBS_TIME = "2026-06-26 09:30:00.000000000"
  const SESSION_START = "2026-06-13 04:15:00.000000000"
  const SESSION_END = "2026-06-13 04:20:00.000000000"
  const obsRow = () => ({
    session_id: "s1",
    analysis_hash: "h1",
    observation_id: "obs-1",
    assigned_cluster_id: "c1",
    reassignment_run_id: "",
    start_time: OBS_TIME,
    end_time: OBS_TIME,
    indexed_at: OBS_TIME,
  })

  it("re-stamps observation start/end from the matching session's analysis time", () => {
    const withOverride = mapClickHouseRow("taxonomy_observations", obsRow(), {
      ...baseInput,
      sessionTimes: new Map([["s1\0h1", { start_time: SESSION_START, end_time: SESSION_END }]]),
    })
    const asSession = mapClickHouseRow(
      "taxonomy_observations",
      { ...obsRow(), start_time: SESSION_START, end_time: SESSION_END },
      baseInput,
    )
    const noOverride = mapClickHouseRow("taxonomy_observations", obsRow(), baseInput)

    // The override yields exactly the session's (spread, past) times…
    expect(withOverride.start_time).toBe(asSession.start_time)
    expect(withOverride.end_time).toBe(asSession.end_time)
    // …not the observation's own bunched value.
    expect(withOverride.start_time).not.toBe(noOverride.start_time)
    // Pinned dates (deltaMs=0 preserves the date) — fully wall-clock independent:
    // the override carries the session day, the fallback the observation day.
    expect(String(withOverride.start_time)).toMatch(/^2026-06-13/)
    expect(String(noOverride.start_time)).toMatch(/^2026-06-26/)
  })

  it("falls back to the observation's own time when no session matches", () => {
    const noMatch = mapClickHouseRow("taxonomy_observations", obsRow(), {
      ...baseInput,
      sessionTimes: new Map([["other\0h", { start_time: SESSION_START, end_time: SESSION_END }]]),
    })
    const noOverride = mapClickHouseRow("taxonomy_observations", obsRow(), baseInput)
    expect(noMatch.start_time).toBe(noOverride.start_time)
  })

  it("never re-stamps non-observation tables (analyses keep their own times)", () => {
    const analysisRow = {
      session_id: "s1",
      analysis_hash: "h1",
      trace_ids: ["t1"],
      analysis_status: "analyzed",
      start_time: SESSION_START,
      end_time: SESSION_END,
      indexed_at: SESSION_START,
    }
    const mapped = mapClickHouseRow("session_analyses", analysisRow, {
      ...baseInput,
      sessionTimes: new Map([["s1\0h1", { start_time: OBS_TIME, end_time: OBS_TIME }]]),
    })
    const baseline = mapClickHouseRow("session_analyses", analysisRow, baseInput)
    expect(mapped.start_time).toBe(baseline.start_time)
  })
})
