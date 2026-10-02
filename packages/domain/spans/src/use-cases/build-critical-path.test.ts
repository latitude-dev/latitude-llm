import { describe, expect, it } from "vitest"
import {
  buildSessionCriticalPath,
  buildTraceCriticalPath,
  type CriticalPathSpanInput,
  marginalCriticalPathNs,
  resolveMarginalAvoidableNs,
} from "./build-critical-path.ts"

const BASE_MS = Date.parse("2026-01-01T00:00:00.000Z")
const at = (ms: number) => new Date(BASE_MS + ms)
const ns = (ms: number) => ms * 1_000_000

const span = (
  spanId: string,
  fromMs: number,
  toMs: number,
  overrides: Partial<CriticalPathSpanInput> = {},
): CriticalPathSpanInput => ({
  traceId: "trace-1",
  spanId,
  parentSpanId: "",
  operation: "execute_tool",
  startTime: at(fromMs),
  endTime: at(toMs),
  ...overrides,
})

const interaction = (spanId: string, fromMs: number, toMs: number, overrides: Partial<CriticalPathSpanInput> = {}) =>
  span(spanId, fromMs, toMs, { operation: "invoke_agent", ...overrides })

const path = (spans: readonly CriticalPathSpanInput[], traceId = "trace-1") =>
  buildTraceCriticalPath({ traceId, spans })

const shape = (spans: readonly CriticalPathSpanInput[]) =>
  path(spans).segments.map((segment) => ({
    kind: segment.kind,
    spanId: segment.spanId,
    ms: segment.durationNs / 1_000_000,
  }))

describe("buildTraceCriticalPath foreground classification", () => {
  it("takes a declared interaction root as the observed envelope", () => {
    const result = path([interaction("root", 0, 1_000), span("tool", 100, 400, { parentSpanId: "root" })])

    expect(result).toMatchObject({
      completeness: "complete",
      role: "userInteraction",
      provenance: "declared",
      observedNs: ns(1_000),
      reasons: [],
    })
    expect(result.envelopes).toEqual([
      { rootSpanId: "root", startedAt: at(0), endedAt: at(1_000), observedNs: ns(1_000) },
    ])
  })

  it("excludes a subagent interaction awaited from outside the trace", () => {
    const result = path([
      interaction("subagent-root", 0, 1_000, { parentSpanId: "span-in-parent-trace" }),
      span("tool", 100, 400, { parentSpanId: "subagent-root" }),
    ])

    expect(result).toMatchObject({ completeness: "notApplicable", role: "nestedInteraction", observedNs: ns(1_000) })
  })

  it("keeps only the interactions nothing outside the trace awaited", () => {
    const result = path([
      interaction("root", 0, 1_000),
      interaction("awaited", 2_000, 2_500, { parentSpanId: "elsewhere" }),
    ])

    expect(result.role).toBe("userInteraction")
    expect(result.envelopes.map((envelope) => envelope.rootSpanId)).toEqual(["root"])
    expect(result.observedNs).toBe(ns(1_000))
  })

  it("treats a nested interaction as a descendant that explains its parent", () => {
    const result = path([interaction("root", 0, 1_000), interaction("subagent", 200, 800, { parentSpanId: "root" })])

    expect(result.observedNs).toBe(ns(1_000))
    expect(result.envelopes).toHaveLength(1)
    expect(marginalCriticalPathNs({ path: result, spanId: "subagent" })).toBe(ns(600))
  })

  it("falls back to one enclosing parentless span and records the weaker provenance", () => {
    const result = path([span("chat", 0, 900, { operation: "chat" }), span("tool", 100, 200, { parentSpanId: "chat" })])

    expect(result).toMatchObject({
      completeness: "complete",
      role: "unclassified",
      provenance: "structural",
      observedNs: ns(900),
    })
  })

  it("refuses to guess when several parentless spans could be the envelope", () => {
    const result = path([span("a", 0, 500, { operation: "chat" }), span("b", 600, 900, { operation: "chat" })])

    expect(result).toMatchObject({
      completeness: "incomplete",
      provenance: null,
      observedNs: 0,
      reasons: ["ambiguousForegroundRoot"],
    })
    expect(result.segments).toEqual([])
  })

  it("reports no foreground root for an empty trace", () => {
    expect(path([])).toMatchObject({ completeness: "incomplete", reasons: ["noForegroundRoot"], observedNs: 0 })
  })
})

describe("buildTraceCriticalPath segments", () => {
  it("decomposes an envelope into owned stretches and unexplained gaps", () => {
    expect(
      shape([
        interaction("root", 0, 1_000),
        span("tool-a", 100, 300, { parentSpanId: "root" }),
        span("tool-b", 500, 900, { parentSpanId: "root" }),
      ]),
    ).toEqual([
      { kind: "gap", spanId: "root", ms: 100 },
      { kind: "span", spanId: "tool-a", ms: 200 },
      { kind: "gap", spanId: "root", ms: 200 },
      { kind: "span", spanId: "tool-b", ms: 400 },
      { kind: "gap", spanId: "root", ms: 100 },
    ])
  })

  it("never adds a descendant on top of its parent envelope", () => {
    const nested = path([
      interaction("root", 0, 1_000),
      span("tool", 0, 1_000, { parentSpanId: "root" }),
      span("chat", 0, 1_000, { parentSpanId: "tool", operation: "chat" }),
    ])

    expect(nested.observedNs).toBe(ns(1_000))
    expect(nested.segments).toHaveLength(1)
    expect(nested.segments[0]).toMatchObject({ kind: "span", spanId: "chat", durationNs: ns(1_000) })
  })

  it("gives the deepest span the stretch and keeps its ancestors' own overhead separate", () => {
    expect(
      shape([
        interaction("root", 0, 1_000),
        span("tool", 100, 900, { parentSpanId: "root" }),
        span("chat", 300, 700, { parentSpanId: "tool", operation: "chat" }),
      ]),
    ).toEqual([
      { kind: "gap", spanId: "root", ms: 100 },
      { kind: "span", spanId: "tool", ms: 200 },
      { kind: "span", spanId: "chat", ms: 400 },
      { kind: "span", spanId: "tool", ms: 200 },
      { kind: "gap", spanId: "root", ms: 100 },
    ])
  })

  it("marks concurrent siblings so neither alone owns the stretch", () => {
    const concurrent = path([
      interaction("root", 0, 1_000),
      span("tool-a", 100, 600, { parentSpanId: "root" }),
      span("tool-b", 200, 800, { parentSpanId: "root" }),
    ])

    expect(concurrent.segments.map((segment) => ({ kind: segment.kind, ms: segment.durationNs / 1_000_000 }))).toEqual([
      { kind: "gap", ms: 100 },
      { kind: "span", ms: 100 },
      { kind: "concurrent", ms: 400 },
      { kind: "span", ms: 200 },
      { kind: "gap", ms: 200 },
    ])
    expect(concurrent.segments[2]?.activeSpanIds).toEqual(["tool-a", "tool-b"])
    expect(concurrent.segments[2]?.spanId).toBeUndefined()
  })

  it("clips a child that runs past its parent and says so", () => {
    const result = path([interaction("root", 0, 500), span("tool", 400, 900, { parentSpanId: "root" })])

    expect(result.observedNs).toBe(ns(500))
    expect(result.reasons).toContain("childOutsideParentEnvelope")
    expect(result.segments.at(-1)).toMatchObject({ kind: "span", spanId: "tool", durationNs: ns(100) })
  })

  it("keeps background work out of the envelope and lists it separately", () => {
    const result = path([
      interaction("root", 0, 500),
      span("after", 600, 900, { parentSpanId: "root" }),
      span("detached", 700, 800),
    ])

    expect(result.observedNs).toBe(ns(500))
    expect(result.excludedSpanIds).toEqual(["after", "detached"])
    expect(result.segments).toEqual([{ ...result.segments[0], kind: "gap", spanId: "root", durationNs: ns(500) }])
  })

  it("flags an orphan and an unfinished span without discarding the observed interval", () => {
    const orphan = path([interaction("root", 0, 500), span("orphan", 100, 200, { parentSpanId: "missing" })])
    const unfinished = path([interaction("root", 0, 500), span("broken", 300, 100, { parentSpanId: "root" })])

    expect(orphan).toMatchObject({ completeness: "incomplete", observedNs: ns(500) })
    expect(orphan.reasons).toContain("missingParent")
    expect(unfinished.reasons).toContain("unfinishedSpan")
  })

  it("sums several declared envelopes and ignores the thinking time between them", () => {
    const result = path([interaction("first", 0, 400), interaction("second", 3_000, 3_500)])

    expect(result.observedNs).toBe(ns(900))
    expect(result.envelopes.map((envelope) => envelope.rootSpanId)).toEqual(["first", "second"])
  })
})

describe("marginalCriticalPathNs", () => {
  const spans = [
    interaction("root", 0, 1_000),
    span("tool", 100, 900, { parentSpanId: "root" }),
    span("chat", 300, 700, { parentSpanId: "tool", operation: "chat" }),
    span("concurrent-a", 900, 1_000, { parentSpanId: "root" }),
    span("concurrent-b", 900, 1_000, { parentSpanId: "root" }),
  ]
  const resolved = path(spans)

  it("credits a subtree with everything only it explains", () => {
    expect(marginalCriticalPathNs({ path: resolved, spanId: "chat" })).toBe(ns(400))
    expect(marginalCriticalPathNs({ path: resolved, spanId: "tool" })).toBe(ns(800))
  })

  it("saves nothing by removing one of two parallel calls", () => {
    expect(marginalCriticalPathNs({ path: resolved, spanId: "concurrent-a" })).toBe(0)
    expect(marginalCriticalPathNs({ path: resolved, spanId: "concurrent-b" })).toBe(0)
  })

  it("credits the parent of two parallel calls with their shared stretch", () => {
    expect(marginalCriticalPathNs({ path: resolved, spanId: "root" })).toBe(ns(900))
  })

  it("returns nothing for a span that is not on the path", () => {
    expect(marginalCriticalPathNs({ path: resolved, spanId: "unknown" })).toBe(0)
  })

  it("caps a claimed saving at what the subtree holds on the path", () => {
    expect(resolveMarginalAvoidableNs({ path: resolved, spanId: "chat", removedNs: ns(150) })).toBe(ns(150))
    expect(resolveMarginalAvoidableNs({ path: resolved, spanId: "chat", removedNs: ns(5_000) })).toBe(ns(400))
    expect(resolveMarginalAvoidableNs({ path: resolved, spanId: "concurrent-a", removedNs: ns(100) })).toBe(0)
    expect(resolveMarginalAvoidableNs({ path: resolved, spanId: "chat", removedNs: -5 })).toBe(0)
  })
})

describe("buildSessionCriticalPath", () => {
  const traceSpans = (traceId: string, offsetMs: number, durationMs: number) => [
    interaction(`${traceId}-root`, offsetMs, offsetMs + durationMs, { traceId }),
    span(`${traceId}-tool`, offsetMs + 10, offsetMs + 20, { traceId, parentSpanId: `${traceId}-root` }),
  ]

  it("sums sequential traces rather than the session wall clock", () => {
    const result = buildSessionCriticalPath({
      spans: [...traceSpans("trace-a", 0, 1_000), ...traceSpans("trace-b", 60_000, 500)],
    })

    expect(result).toMatchObject({ completeness: "complete", observedNs: ns(1_500), completeTraceCount: 2 })
    expect(result.traces.map((trace) => trace.traceId)).toEqual(["trace-a", "trace-b"])
  })

  it("never counts overlapping traces once, nor unions them", () => {
    const result = buildSessionCriticalPath({
      spans: [...traceSpans("trace-a", 0, 1_000), ...traceSpans("trace-b", 500, 1_000)],
    })

    expect(result.observedNs).toBe(ns(2_000))
  })

  it("excludes an incomplete trace from observed time but keeps its exact segments", () => {
    const result = buildSessionCriticalPath({
      spans: [
        ...traceSpans("trace-a", 0, 1_000),
        span("loose-a", 0, 100, { traceId: "trace-b", operation: "chat" }),
        span("loose-b", 200, 300, { traceId: "trace-b", operation: "chat" }),
      ],
    })

    expect(result).toMatchObject({
      completeness: "partial",
      observedNs: ns(1_000),
      completeTraceCount: 1,
      incompleteTraceCount: 1,
      reasons: ["ambiguousForegroundRoot"],
    })
  })

  it("reports unavailable when no trace reconstructs", () => {
    const result = buildSessionCriticalPath({
      spans: [
        span("loose-a", 0, 100, { traceId: "trace-b", operation: "chat" }),
        span("loose-b", 200, 300, { traceId: "trace-b", operation: "chat" }),
      ],
    })

    expect(result).toMatchObject({ completeness: "unavailable", observedNs: 0, completeTraceCount: 0 })
  })

  it("does not let a subagent trace make the session partial", () => {
    const result = buildSessionCriticalPath({
      spans: [
        ...traceSpans("trace-a", 0, 1_000),
        interaction("sub-root", 100, 400, { traceId: "trace-sub", parentSpanId: "trace-a-root" }),
      ],
    })

    expect(result).toMatchObject({ completeness: "complete", observedNs: ns(1_000), incompleteTraceCount: 0 })
    expect(result.traces.find((trace) => trace.traceId === "trace-sub")?.completeness).toBe("notApplicable")
  })

  it("returns an unavailable path for no spans at all", () => {
    expect(buildSessionCriticalPath({ spans: [] })).toMatchObject({
      completeness: "unavailable",
      observedNs: 0,
      traces: [],
    })
  })
})
