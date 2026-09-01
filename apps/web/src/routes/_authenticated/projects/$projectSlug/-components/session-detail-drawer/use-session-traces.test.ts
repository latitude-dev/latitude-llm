import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"

const listSessionTraces = vi.fn()
const listTracesByProject = vi.fn()

vi.mock("../../../../../../domains/traces/traces.functions.ts", () => ({
  listSessionTraces: (...args: unknown[]) => listSessionTraces(...args),
  listTracesByProject: (...args: unknown[]) => listTracesByProject(...args),
}))

// Imported after the mock is registered.
const { sessionTracePageQueryOptions, sessionTracesQueryOptions } = await import("./use-session-traces.ts")

const trace = (traceId: string, startTime: string): TraceRecord => ({ traceId, startTime }) as unknown as TraceRecord

beforeEach(() => {
  listSessionTraces.mockReset()
  listTracesByProject.mockReset()
})

describe("sessionTracePageQueryOptions queryFn", () => {
  it("fetches only the requested session trace page", async () => {
    const ids = Array.from({ length: 100 }, (_, index) => `t${index}`)
    listSessionTraces.mockResolvedValue({ traces: [], hasMore: true })

    const result = await sessionTracePageQueryOptions(undefined, "p1", "s1", ids, 25).queryFn()

    expect(listSessionTraces).toHaveBeenCalledWith({ data: { projectId: "p1", traceIds: ids, limit: 25 } })
    expect(result).toEqual({ traces: [], hasMore: true })
  })

  it("supports chronological cursor pages for session spans", async () => {
    const cursor = { sortValue: "2026-01-01T00:00:00.000Z", traceId: "t25" }
    listSessionTraces.mockResolvedValue({ traces: [], hasMore: true })

    await sessionTracePageQueryOptions(undefined, "p1", "s1", ["t1", "t25"], 25, {
      cursor,
      sortDirection: "asc",
    }).queryFn()

    expect(listSessionTraces).toHaveBeenCalledWith({
      data: {
        projectId: "p1",
        traceIds: ["t1", "t25"],
        limit: 25,
        cursor,
        sortDirection: "asc",
      },
    })
  })

  it("caps oversized sessions at 500 traces", async () => {
    const ids = Array.from({ length: 650 }, (_, index) => `t${index}`)
    listSessionTraces.mockResolvedValue({ traces: [], hasMore: false })

    await sessionTracePageQueryOptions(undefined, "p1", "s1", ids, 650).queryFn()

    expect(listSessionTraces.mock.calls[0]?.[0]?.data.traceIds).toHaveLength(500)
    expect(listSessionTraces.mock.calls[0]?.[0]?.data.limit).toBe(500)
  })
})

describe("sessionTracesQueryOptions queryFn", () => {
  it("fetches a single-trace session by a one-element `traceId in` filter", async () => {
    listTracesByProject.mockResolvedValueOnce({
      traces: [trace("t1", "2024-01-01T00:00:00Z")],
    })

    const result = await sessionTracesQueryOptions(undefined, "p1", "t1", ["t1"]).queryFn()

    expect(listTracesByProject).toHaveBeenCalledTimes(1)
    expect(listTracesByProject).toHaveBeenCalledWith({
      data: {
        projectId: "p1",
        limit: 1,
        sortBy: "startTime",
        sortDirection: "desc",
        filters: { traceId: [{ op: "in", value: ["t1"] }] },
      },
    })
    expect(result.map((t) => t.traceId)).toEqual(["t1"])
  })

  it("chunks trace ids into batches of 100", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `t${i}`)
    listTracesByProject.mockResolvedValue({ traces: [] })

    await sessionTracesQueryOptions(undefined, "p1", "s1", ids).queryFn()

    expect(listTracesByProject).toHaveBeenCalledTimes(2)
    const firstChunk = listTracesByProject.mock.calls[0]?.[0]?.data.filters.traceId[0].value
    const secondChunk = listTracesByProject.mock.calls[1]?.[0]?.data.filters.traceId[0].value
    expect(firstChunk).toHaveLength(100)
    expect(secondChunk).toHaveLength(50)
  })

  it("returns early without a fetch when there are no trace ids", async () => {
    const result = await sessionTracesQueryOptions(undefined, "p1", "s1", []).queryFn()

    expect(listTracesByProject).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it("merges chunks and sorts by startTime descending then traceId", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `t${i}`)
    listTracesByProject.mockResolvedValueOnce({ traces: [trace("t0", "2024-01-01T00:00:00Z")] }).mockResolvedValueOnce({
      traces: [trace("t100", "2024-01-02T00:00:00Z")],
    })

    const result = await sessionTracesQueryOptions(undefined, "p1", "s1", ids).queryFn()

    expect(result.map((t) => t.traceId)).toEqual(["t100", "t0"])
  })

  it("caps the fetched set at 500 trace ids", async () => {
    const ids = Array.from({ length: 650 }, (_, i) => `t${i}`)
    listTracesByProject.mockResolvedValue({ traces: [] })

    await sessionTracesQueryOptions(undefined, "p1", "s1", ids).queryFn()

    // 500 ids / 100 per chunk = 5 calls (the 150 overflow is dropped).
    expect(listTracesByProject).toHaveBeenCalledTimes(5)
  })
})
